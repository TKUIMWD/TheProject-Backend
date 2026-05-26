import { pve_api } from "../../enum/PVE_API";
import { PVE_TASK_EXIT_STATUS, PVE_TASK_STATUS, PVE_Task_Status_Response } from "../../interfaces/PVE";
import { PVEResp } from "../../interfaces/Response/PVEResp";
import { VM_Task_Status } from "../../interfaces/VM/VM_Task";
import { logger } from "../../middlewares/log";
import { pveClient } from "../pve/PVEClient";
import { PVEUtils } from "../../utils/PVEUtils";
import { VMUtils } from "../../utils/VMUtils";
import {
    getVMConfigOperationMetadata,
    normalizeVMConfigOperationError,
    VMConfigOperationName
} from "./VMConfigOperationPolicy";
import { buildVMConfigUpdateExecutionPlan } from "./VMConfigUpdatePolicy";
import { classifyVMDiskReadiness } from "./VMDiskReadinessPolicy";
import {
    buildVMTaskStepUpdate,
    VM_CREATION_STEP_INDICES,
    VM_UPDATE_CONFIG_STEP_INDICES
} from "./VMTaskFactory";
import { vmTaskRepository } from "./VMTaskRepository";

type VMConfigOperationResult = { success: boolean; errorMessage?: string };
type VMConfigActionResult = { success: boolean; upid?: string; errorMessage?: string };

type VMTaskRepositoryPort = {
    updateTask(taskId: string, update: unknown): Promise<unknown>;
};

type PVEClientPort = {
    request<T = unknown>(method: string, url: string): Promise<T>;
};

type VMUtilsPort = {
    waitForTaskCompletion(node: string, upid: string, operationType?: string): Promise<VMConfigOperationResult>;
    waitForVMDiskReady(node: string, vmid: string, maxRetries?: number): Promise<VMConfigOperationResult>;
    getVMConfig(node: string, vmid: string): Promise<any>;
    updateVMName(node: string, vmid: string, vmName: string): Promise<VMConfigActionResult>;
    configureVMCPU(node: string, vmid: string, cpuCores: number): Promise<VMConfigActionResult>;
    configureVMMemory(node: string, vmid: string, memorySize: number): Promise<VMConfigActionResult>;
    resizeVMDisk(node: string, vmid: string, diskSize: number): Promise<VMConfigActionResult>;
    configureCloudInit(node: string, vmid: string, ciuser: string, cipassword: string): Promise<VMConfigActionResult>;
    regenerateCloudInit(node: string, vmid: string): Promise<VMConfigActionResult>;
};

type SleepFn = (ms: number) => Promise<void>;

export type VMConfigExecutionServiceDeps = {
    taskRepository?: VMTaskRepositoryPort;
    pveClient?: PVEClientPort;
    vmUtils?: VMUtilsPort;
    sleep?: SleepFn;
    diskReadyRetryDelayMs?: number;
    stabilizeDelayMs?: number;
};

const defaultSleep: SleepFn = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export class VMConfigExecutionService {
    private readonly taskRepository: VMTaskRepositoryPort;
    private readonly pveClient: PVEClientPort;
    private readonly vmUtils: VMUtilsPort;
    private readonly sleep: SleepFn;
    private readonly diskReadyRetryDelayMs: number;
    private readonly stabilizeDelayMs: number;

    constructor(deps: VMConfigExecutionServiceDeps = {}) {
        this.taskRepository = deps.taskRepository ?? vmTaskRepository;
        this.pveClient = deps.pveClient ?? pveClient;
        this.vmUtils = deps.vmUtils ?? VMUtils;
        this.sleep = deps.sleep ?? defaultSleep;
        this.diskReadyRetryDelayMs = deps.diskReadyRetryDelayMs ?? 10000;
        this.stabilizeDelayMs = deps.stabilizeDelayMs ?? 5000;
    }

    public async configureClonedVM(input: {
        targetNode: string;
        vmid: string;
        cpuCores: number;
        memorySize: number;
        diskSize: number;
        cloneUpid: string;
        sourceNode: string;
        taskId: string;
        ciuser?: string;
        cipassword?: string;
    }): Promise<VMConfigOperationResult> {
        try {
            const cloneWaitResult = await this.waitForTaskCompletion(
                input.sourceNode,
                input.cloneUpid,
                input.taskId,
                VM_CREATION_STEP_INDICES.CLONE
            );
            if (!cloneWaitResult.success) {
                return { success: false, errorMessage: `Clone task failed: ${cloneWaitResult.errorMessage}` };
            }

            logger.info(`Waiting for VM ${input.vmid} disk to be ready after clone...`);
            const diskReadyResult = await this.waitForVMDiskReady(input.targetNode, input.vmid, 20);
            if (!diskReadyResult.success) {
                logger.error(`VM ${input.vmid} disk not ready: ${diskReadyResult.errorMessage}`);
                return { success: false, errorMessage: diskReadyResult.errorMessage };
            }

            const cpuConfigResult = await this.configureVMCPU(
                input.targetNode,
                input.vmid,
                input.cpuCores,
                input.taskId,
                VM_CREATION_STEP_INDICES.CPU
            );
            if (!cpuConfigResult.success) {
                return { success: false, errorMessage: `CPU configuration failed: ${cpuConfigResult.errorMessage}` };
            }

            const memoryConfigResult = await this.configureVMMemory(
                input.targetNode,
                input.vmid,
                input.memorySize,
                input.taskId,
                VM_CREATION_STEP_INDICES.MEMORY
            );
            if (!memoryConfigResult.success) {
                return { success: false, errorMessage: `Memory configuration failed: ${memoryConfigResult.errorMessage}` };
            }

            const diskConfigResult = await this.resizeVMDisk(
                input.targetNode,
                input.vmid,
                input.diskSize,
                input.taskId,
                VM_CREATION_STEP_INDICES.DISK
            );
            if (!diskConfigResult.success) {
                return { success: false, errorMessage: `Disk resize failed: ${diskConfigResult.errorMessage}` };
            }

            if (!input.ciuser || !input.cipassword) {
                logger.warn(`Cloud-Init user or password not provided, skipping Cloud-Init configuration for VM ${input.vmid}`);
            } else {
                const cloudInitResult = await this.configureCloudInit(
                    input.targetNode,
                    input.vmid,
                    input.ciuser,
                    input.cipassword,
                    input.taskId,
                    VM_CREATION_STEP_INDICES.CLOUD_INIT
                );
                if (!cloudInitResult.success) {
                    return { success: false, errorMessage: `Cloud-Init configuration failed: ${cloudInitResult.errorMessage}` };
                }
            }

            return { success: true };
        } catch (error) {
            logger.error(`Error during VM configuration:`, error);
            return { success: false, errorMessage: error instanceof Error ? error.message : "Unknown error during configuration" };
        }
    }

    public async updateVMConfiguration(input: {
        node: string;
        vmid: string;
        currentCpuCores: number;
        currentMemorySize: number;
        currentDiskSize: number;
        newCpuCores: number;
        newMemorySize: number;
        newDiskSize: number;
        taskId: string;
        ciuser?: string;
        cipassword?: string;
        vmName?: string;
    }): Promise<VMConfigOperationResult> {
        try {
            logger.info(`Waiting for VM ${input.vmid} disk to be ready before configuration update...`);
            const diskReadyResult = await this.vmUtils.waitForVMDiskReady(input.node, input.vmid, 20);
            if (!diskReadyResult.success) {
                logger.error(`VM ${input.vmid} disk not ready: ${diskReadyResult.errorMessage}`);
                return { success: false, errorMessage: diskReadyResult.errorMessage };
            }

            const executionPlan = buildVMConfigUpdateExecutionPlan(input);

            if (executionPlan.updateName && input.vmName) {
                const nameUpdateResult = await this.updateVMName(
                    input.node,
                    input.vmid,
                    input.vmName,
                    input.taskId,
                    VM_UPDATE_CONFIG_STEP_INDICES.NAME
                );
                if (!nameUpdateResult.success) {
                    return { success: false, errorMessage: `VM name update failed: ${nameUpdateResult.errorMessage}` };
                }
            }

            if (executionPlan.updateCpu) {
                const cpuConfigResult = await this.configureVMCPU(
                    input.node,
                    input.vmid,
                    input.newCpuCores,
                    input.taskId,
                    VM_UPDATE_CONFIG_STEP_INDICES.CPU
                );
                if (!cpuConfigResult.success) {
                    return { success: false, errorMessage: `CPU configuration failed: ${cpuConfigResult.errorMessage}` };
                }
            }

            if (executionPlan.updateMemory) {
                const memoryConfigResult = await this.configureVMMemory(
                    input.node,
                    input.vmid,
                    input.newMemorySize,
                    input.taskId,
                    VM_UPDATE_CONFIG_STEP_INDICES.MEMORY
                );
                if (!memoryConfigResult.success) {
                    return { success: false, errorMessage: `Memory configuration failed: ${memoryConfigResult.errorMessage}` };
                }
            }

            if (executionPlan.resizeDisk) {
                const diskConfigResult = await this.resizeVMDisk(
                    input.node,
                    input.vmid,
                    input.newDiskSize,
                    input.taskId,
                    VM_UPDATE_CONFIG_STEP_INDICES.DISK
                );
                if (!diskConfigResult.success) {
                    return { success: false, errorMessage: `Disk resize failed: ${diskConfigResult.errorMessage}` };
                }
            } else if (executionPlan.diskReductionError) {
                logger.warn(`Disk size reduction not supported: current=${input.currentDiskSize}GB, requested=${input.newDiskSize}GB`);
                return { success: false, errorMessage: executionPlan.diskReductionError };
            }

            if (executionPlan.updateCloudInit && input.ciuser !== undefined && input.cipassword !== undefined) {
                const cloudInitResult = await this.configureCloudInit(
                    input.node,
                    input.vmid,
                    input.ciuser,
                    input.cipassword,
                    input.taskId,
                    VM_UPDATE_CONFIG_STEP_INDICES.CLOUD_INIT
                );
                if (!cloudInitResult.success) {
                    return { success: false, errorMessage: `Cloud-Init configuration failed: ${cloudInitResult.errorMessage}` };
                }

                logger.info(`Regenerating cloud-init for VM ${input.vmid} after configuration update`);
                const regenResult = await this.vmUtils.regenerateCloudInit(input.node, input.vmid);
                if (!regenResult.success) {
                    logger.warn(`Cloud-Init regeneration failed for VM ${input.vmid}: ${regenResult.errorMessage}`);
                } else {
                    logger.info(`Cloud-Init regeneration completed for VM ${input.vmid}, UPID: ${regenResult.upid}`);
                }
            }

            return { success: true };
        } catch (error) {
            logger.error(`Error during VM configuration update:`, error);
            return { success: false, errorMessage: error instanceof Error ? error.message : "Unknown error during configuration update" };
        }
    }

    private async configureCloudInit(node: string, vmid: string, ciuser: string, cipassword: string, taskId: string, stepIndex: number): Promise<VMConfigOperationResult> {
        return this.runVMConfigOperation(node, taskId, stepIndex, "cloudInit", () => this.vmUtils.configureCloudInit(node, vmid, ciuser, cipassword));
    }

    private async configureVMMemory(node: string, vmid: string, memorySize: number, taskId: string, stepIndex: number): Promise<VMConfigOperationResult> {
        return this.runVMConfigOperation(node, taskId, stepIndex, "memory", () => this.vmUtils.configureVMMemory(node, vmid, memorySize));
    }

    private async resizeVMDisk(node: string, vmid: string, diskSize: number, taskId: string, stepIndex: number): Promise<VMConfigOperationResult> {
        try {
            await this.updateTaskStep(taskId, stepIndex, VM_Task_Status.IN_PROGRESS);

            logger.info(`Waiting for VM ${vmid} disk to be ready before resizing...`);
            const diskReadyCheck = await this.waitForVMDiskReady(node, vmid, 15);
            if (!diskReadyCheck.success) {
                logger.error(`Disk not ready for resize on VM ${vmid}: ${diskReadyCheck.errorMessage}`);
                await this.updateTaskStep(taskId, stepIndex, VM_Task_Status.FAILED, undefined, diskReadyCheck.errorMessage);
                return { success: false, errorMessage: diskReadyCheck.errorMessage };
            }

            logger.info(`Waiting additional time for VM ${vmid} disk to stabilize before resize...`);
            await this.sleep(this.stabilizeDelayMs);

            const currentConfig = await this.vmUtils.getVMConfig(node, vmid);
            const currentDiskSize = PVEUtils.extractDiskSizeFromConfig(currentConfig?.scsi0);
            if (currentDiskSize !== null && currentDiskSize >= diskSize) {
                logger.info(`Skipping disk resize for VM ${vmid}: current disk ${currentDiskSize}G >= requested ${diskSize}G`);
                await this.updateTaskStep(taskId, stepIndex, VM_Task_Status.COMPLETED, `Disk resize skipped; current disk ${currentDiskSize}G >= requested ${diskSize}G`);
                return { success: true };
            }

            return this.runVMConfigOperation(node, taskId, stepIndex, "disk", () => this.vmUtils.resizeVMDisk(node, vmid, diskSize), false);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Unknown error";
            await this.updateTaskStep(taskId, stepIndex, VM_Task_Status.FAILED, undefined, errorMsg);
            return { success: false, errorMessage: errorMsg };
        }
    }

    private async waitForTaskCompletion(node: string, upid: string, taskId: string, stepIndex: number): Promise<VMConfigOperationResult> {
        const maxRetries = 300;
        let retries = 0;

        while (retries < maxRetries) {
            try {
                const taskStatus: PVEResp = await this.pveClient.request('GET', pve_api.nodes_tasks_status(node, upid));

                if (taskStatus && taskStatus.data) {
                    const status = taskStatus.data as PVE_Task_Status_Response;

                    if (status.status === PVE_TASK_STATUS.STOPPED) {
                        if (status.exitstatus === PVE_TASK_EXIT_STATUS.OK) {
                            await this.updateTaskStep(taskId, stepIndex, VM_Task_Status.COMPLETED, upid);
                            return { success: true };
                        }

                        await this.updateTaskStep(taskId, stepIndex, VM_Task_Status.FAILED, upid, `Task failed with exit status: ${status.exitstatus}`);
                        return { success: false, errorMessage: `Task failed with exit status: ${status.exitstatus}` };
                    }

                    await this.sleep(1000);
                    retries++;
                } else {
                    return { success: false, errorMessage: "Failed to get task status" };
                }
            } catch (error) {
                logger.error(`Error checking task status for ${upid}:`, error);
                return { success: false, errorMessage: error instanceof Error ? error.message : "Unknown error" };
            }
        }

        return { success: false, errorMessage: "Task timeout" };
    }

    private async waitForVMDiskReady(targetNode: string, vmid: string, maxRetries: number = 10): Promise<VMConfigOperationResult> {
        try {
            logger.info(`Waiting for VM ${vmid} disk to be ready on node ${targetNode}`);

            for (let i = 0; i < maxRetries; i++) {
                try {
                    const configResp: PVEResp = await this.pveClient.request('GET', pve_api.nodes_qemu_config(targetNode, vmid));

                    const diskDecision = classifyVMDiskReadiness(configResp?.data);
                    if (diskDecision.ready) {
                        logger.info(`VM ${vmid} disk is ready with format ${diskDecision.format}: ${diskDecision.scsi0}`);
                        return { success: true };
                    }
                    if (diskDecision.state === "unclear_format") {
                        logger.warn(`VM ${vmid} disk format unclear (attempt ${i + 1}/${maxRetries}): ${diskDecision.scsi0}`);
                    } else if (diskDecision.state === "preparing") {
                        logger.info(`VM ${vmid} disk still being prepared (attempt ${i + 1}/${maxRetries}): ${diskDecision.scsi0}`);
                    } else {
                        logger.warn(`VM ${vmid} disk config not found (attempt ${i + 1}/${maxRetries})`);
                        if (configResp && configResp.data) {
                            logger.warn(`VM ${vmid} config data:`, JSON.stringify(configResp.data, null, 2));
                        }
                    }
                } catch (error) {
                    logger.warn(`Error checking VM ${vmid} disk status (attempt ${i + 1}/${maxRetries}):`, error);

                    if (error instanceof SyntaxError && error.message.includes('JSON')) {
                        logger.error(`JSON parsing error while checking disk status for VM ${vmid}:`, error.message);
                    }
                }

                if (i < maxRetries - 1) {
                    await this.sleep(this.diskReadyRetryDelayMs);
                }
            }

            return { success: false, errorMessage: `VM ${vmid} disk not ready after ${maxRetries} attempts` };
        } catch (error) {
            logger.error(`Error waiting for VM ${vmid} disk to be ready:`, error);
            return { success: false, errorMessage: `Failed to wait for VM disk readiness` };
        }
    }

    private async updateTaskStep(taskId: string, stepIndex: number, status: VM_Task_Status, upid?: string, errorMessage?: string): Promise<void> {
        try {
            const updateQuery = buildVMTaskStepUpdate(stepIndex, status, upid, errorMessage);
            await this.taskRepository.updateTask(taskId, updateQuery);
        } catch (error) {
            logger.error(`Error updating task step ${stepIndex} for ${taskId}:`, error);
        }
    }

    private async runVMConfigOperation(
        node: string,
        taskId: string,
        stepIndex: number,
        operation: VMConfigOperationName,
        action: () => Promise<VMConfigActionResult>,
        markInProgress = true
    ): Promise<VMConfigOperationResult> {
        try {
            if (markInProgress) {
                await this.updateTaskStep(taskId, stepIndex, VM_Task_Status.IN_PROGRESS);
            }
            const metadata = getVMConfigOperationMetadata(operation);
            const operationResult = await action();

            if (operationResult.success) {
                if (operationResult.upid) {
                    const waitResult = await this.vmUtils.waitForTaskCompletion(node, operationResult.upid, metadata.waitLabel);
                    if (!waitResult.success) {
                        await this.updateTaskStep(taskId, stepIndex, VM_Task_Status.FAILED, undefined, waitResult.errorMessage);
                        return { success: false, errorMessage: waitResult.errorMessage };
                    }
                }

                await this.updateTaskStep(taskId, stepIndex, VM_Task_Status.COMPLETED, metadata.completedMessage);
                return { success: true };
            }

            await this.updateTaskStep(taskId, stepIndex, VM_Task_Status.FAILED, undefined, operationResult.errorMessage);
            return { success: false, errorMessage: operationResult.errorMessage };
        } catch (error) {
            const errorMsg = normalizeVMConfigOperationError(error);
            await this.updateTaskStep(taskId, stepIndex, VM_Task_Status.FAILED, undefined, errorMsg);
            return { success: false, errorMessage: errorMsg };
        }
    }

    private async updateVMName(node: string, vmid: string, vmName: string, taskId: string, stepIndex: number): Promise<VMConfigOperationResult> {
        return this.runVMConfigOperation(node, taskId, stepIndex, "name", () => this.vmUtils.updateVMName(node, vmid, vmName));
    }

    private async configureVMCPU(node: string, vmid: string, cpuCores: number, taskId: string, stepIndex: number): Promise<VMConfigOperationResult> {
        return this.runVMConfigOperation(node, taskId, stepIndex, "cpu", () => this.vmUtils.configureVMCPU(node, vmid, cpuCores));
    }
}

export const vmConfigExecutionService = new VMConfigExecutionService();
