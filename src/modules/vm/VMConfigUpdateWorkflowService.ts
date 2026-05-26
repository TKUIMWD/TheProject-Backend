import { PVEResp } from "../../interfaces/Response/PVEResp";
import { User } from "../../interfaces/User";
import { VMConfig } from "../../interfaces/VM/VM";
import { VM_Task, VM_Task_Status } from "../../interfaces/VM/VM_Task";
import { logger } from "../../middlewares/log";
import { PVEUtils } from "../../utils/PVEUtils";
import { VMUtils } from "../../utils/VMUtils";
import { createResponse, resp } from "../../utils/resp";
import { validateObjectIdInput } from "../common/ObjectIdPolicy";
import {
    buildVMConfigUpdateSuccessBody,
    calculateVMConfigUpdateResources,
    validateVMConfigUpdateRequest
} from "./VMConfigUpdatePolicy";
import { vmConfigExecutionService } from "./VMConfigExecutionService";
import { vmRepository } from "./VMRepository";
import { vmResourceAccountingService } from "./VMResourceAccountingService";
import { buildVMTaskStatusUpdate, buildVMUpdateTask } from "./VMTaskFactory";
import { vmTaskRepository } from "./VMTaskRepository";

type VMConfigUpdateVMUtils = {
    getCurrentVMConfig(node: string, vmid: string): Promise<VMConfig | null>;
    getVMStatus(node: string, vmid: string): Promise<{ status?: string } | null>;
};

type VMConfigUpdateWorkflowServiceDeps = {
    vmRepo?: {
        findById(vmId: string): Promise<any | null>;
    };
    taskRepo?: {
        createTask(task: VM_Task): Promise<unknown>;
        updateTask(taskId: string, update: unknown): Promise<unknown>;
    };
    resourceAccountingService?: {
        checkUpdateLimits(input: {
            user: User;
            cpuDelta: number;
            memoryDelta: number;
            diskDelta: number;
            newCpuCores: number;
            newMemorySize: number;
            newDiskSize: number;
        }): Promise<resp<unknown>>;
        incrementUsage(userId: string, cpuDelta: number, memoryDelta: number, diskDelta: number): Promise<unknown>;
    };
    configExecutionService?: {
        updateVMConfiguration(input: {
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
        }): Promise<{ success: boolean; errorMessage?: string }>;
    };
    vmUtils?: VMConfigUpdateVMUtils;
    extractDiskSize?: (diskConfig?: string) => number | null;
};

export class VMConfigUpdateWorkflowService {
    private readonly vmRepo: NonNullable<VMConfigUpdateWorkflowServiceDeps["vmRepo"]>;
    private readonly taskRepo: NonNullable<VMConfigUpdateWorkflowServiceDeps["taskRepo"]>;
    private readonly resourceAccountingService: NonNullable<VMConfigUpdateWorkflowServiceDeps["resourceAccountingService"]>;
    private readonly configExecutionService: NonNullable<VMConfigUpdateWorkflowServiceDeps["configExecutionService"]>;
    private readonly vmUtils: VMConfigUpdateVMUtils;
    private readonly extractDiskSize: (diskConfig?: string) => number | null;

    constructor(deps: VMConfigUpdateWorkflowServiceDeps = {}) {
        this.vmRepo = deps.vmRepo ?? vmRepository;
        this.taskRepo = deps.taskRepo ?? vmTaskRepository;
        this.resourceAccountingService = deps.resourceAccountingService ?? vmResourceAccountingService;
        this.configExecutionService = deps.configExecutionService ?? vmConfigExecutionService;
        this.vmUtils = deps.vmUtils ?? VMUtils;
        this.extractDiskSize = deps.extractDiskSize ?? PVEUtils.extractDiskSizeFromConfig;
    }

    public async updateVMConfig(input: {
        user: User;
        body: {
            vm_id?: unknown;
            cpuCores?: number;
            memorySize?: number;
            diskSize?: number;
            vmName?: unknown;
            ciuser?: string;
            cipassword?: string;
        };
    }): Promise<resp<PVEResp | undefined>> {
        const { vm_id, cpuCores, memorySize, diskSize, vmName, ciuser: requestCiuser, cipassword: requestCipassword } = input.body;
        const vmIdResult = validateObjectIdInput(vm_id, "vm_id");
        if (!vmIdResult.valid) {
            return createResponse(400, vmIdResult.message);
        }
        const normalizedVmId = vmIdResult.value;

        logger.info(`User ${input.user.username} (${input.user._id}) starting VM config update for VM ${normalizedVmId}`);

        const updateRequestPolicy = validateVMConfigUpdateRequest({
            cpuCores,
            memorySize,
            diskSize,
            vmName,
            requestCiuser,
            requestCipassword
        });
        if (!updateRequestPolicy.valid) {
            return createResponse(400, updateRequestPolicy.message);
        }
        const sanitizedVMName = updateRequestPolicy.sanitizedVMName;

        if (!input.user.owned_vms.includes(normalizedVmId)) {
            return createResponse(403, "Access denied: VM not owned by user");
        }

        const vm = await this.vmRepo.findById(normalizedVmId);
        if (!vm) {
            return createResponse(404, "VM not found");
        }

        const currentVMConfig = await this.vmUtils.getCurrentVMConfig(vm.pve_node, vm.pve_vmid);
        if (!currentVMConfig) {
            return createResponse(404, "Cannot get current VM configuration");
        }

        const vmStatus = await this.vmUtils.getVMStatus(vm.pve_node, vm.pve_vmid);
        if (!vmStatus || vmStatus.status !== "stopped") {
            logger.warn(`VM ${vm.pve_vmid} is not stopped (current status: ${vmStatus?.status || "unknown"}), cannot update configuration`);
            return createResponse(400, "VM must be stopped before updating configuration. Please shut down the VM first.");
        }

        logger.info(`Current VM config - CPU: ${currentVMConfig.cores}, Memory: ${currentVMConfig.memory}MB, Disk: ${this.extractDiskSize(currentVMConfig.scsi0)}GB, Status: ${vmStatus.status}`);

        const resourceUpdate = calculateVMConfigUpdateResources(currentVMConfig, {
            cpuCores,
            memorySize,
            diskSize
        });
        const {
            currentCpuCores,
            currentMemorySize,
            currentDiskSize,
            newCpuCores,
            newMemorySize,
            newDiskSize,
            cpuDelta,
            memoryDelta,
            diskDelta
        } = resourceUpdate;

        logger.info(`Resource deltas - CPU: ${cpuDelta}, Memory: ${memoryDelta}MB, Disk: ${diskDelta}GB`);

        if (cpuDelta > 0 || memoryDelta > 0 || diskDelta > 0) {
            const resourceCheckResult = await this.resourceAccountingService.checkUpdateLimits({
                user: input.user,
                cpuDelta,
                memoryDelta,
                diskDelta,
                newCpuCores,
                newMemorySize,
                newDiskSize
            });
            if (resourceCheckResult.code !== 200) {
                logger.warn(`VM config update resource limits exceeded for user ${input.user.username}: CPU=${cpuDelta}, Memory=${memoryDelta}MB, Disk=${diskDelta}GB`);
                return resourceCheckResult as resp<PVEResp | undefined>;
            }
        }

        const task = await this.createVMUpdateTask(normalizedVmId, input.user._id!.toString(), vm.pve_vmid, vm.pve_node);
        logger.info(`Created VM config update task ${task.task_id} for user ${input.user.username}, VM ID: ${vm.pve_vmid}`);

        const configResult = await this.configExecutionService.updateVMConfiguration({
            node: vm.pve_node,
            vmid: vm.pve_vmid,
            currentCpuCores,
            currentMemorySize,
            currentDiskSize,
            newCpuCores,
            newMemorySize,
            newDiskSize,
            taskId: task.task_id,
            ciuser: requestCiuser,
            cipassword: requestCipassword,
            vmName: sanitizedVMName
        });

        if (!configResult.success) {
            await this.updateTaskStatus(task.task_id, VM_Task_Status.FAILED, undefined, configResult.errorMessage);
            logger.error(`VM configuration update failed for user ${input.user.username}, task ${task.task_id}: ${configResult.errorMessage}`);
            return createResponse(500, `VM configuration update failed: ${configResult.errorMessage}`);
        }

        if (cpuDelta !== 0 || memoryDelta !== 0 || diskDelta !== 0) {
            await this.resourceAccountingService.incrementUsage(input.user._id!.toString(), cpuDelta, memoryDelta, diskDelta);
            logger.info(`Updated user resource usage - CPU delta: ${cpuDelta}, Memory delta: ${memoryDelta}MB, Disk delta: ${diskDelta}GB`);
        }

        await this.updateTaskStatus(task.task_id, VM_Task_Status.COMPLETED, undefined);
        logger.info(`VM ${vm.pve_vmid} configuration updated successfully for user ${input.user.username}, task ${task.task_id}`);

        return createResponse(200, "VM configuration updated successfully", buildVMConfigUpdateSuccessBody({
            taskId: task.task_id,
            vmId: normalizedVmId,
            pveVmid: vm.pve_vmid,
            cpuCores: newCpuCores,
            memorySize: newMemorySize,
            diskSize: newDiskSize,
            vmName: sanitizedVMName
        }));
    }

    private async createVMUpdateTask(vmId: string, userId: string, pveVmid: string, pveNode: string): Promise<VM_Task> {
        const task = buildVMUpdateTask({ vmId, userId, pveVmid, pveNode });
        await this.taskRepo.createTask(task);
        return task;
    }

    private async updateTaskStatus(taskId: string, status: VM_Task_Status, upid?: string, errorMessage?: string): Promise<void> {
        try {
            await this.taskRepo.updateTask(taskId, buildVMTaskStatusUpdate(status, upid, errorMessage));
        } catch (error) {
            logger.error(`Error updating task status for ${taskId}:`, error);
        }
    }
}

export const vmConfigUpdateWorkflowService = new VMConfigUpdateWorkflowService();
