import { pve_api } from "../../enum/PVE_API";
import { PVEResp } from "../../interfaces/Response/PVEResp";
import { User } from "../../interfaces/User";
import { VM_Template } from "../../interfaces/VM/VM_Template";
import { VM_Task, VM_Task_Status } from "../../interfaces/VM/VM_Task";
import { logger } from "../../middlewares/log";
import { pveClient } from "../pve/PVEClient";
import { resp, createResponse } from "../../utils/resp";
import { VMUtils } from "../../utils/VMUtils";
import {
    buildOrphanCloudInitVolume,
    isMissingCloudInitVolumeError,
    selectOldVMTaskIdsForRetention
} from "./VMCreationCleanupPolicy";
import {
    buildVMCreationSuccessBody,
    VM_CLONE_FAILURE_MESSAGE,
    VM_CONFIGURATION_CLEANED_UP_FAILURE_MESSAGE,
    VM_CREATION_SUCCESS_MESSAGE
} from "./VMCreationResponsePolicy";
import { vmConfigExecutionService } from "./VMConfigExecutionService";
import { vmRepository } from "./VMRepository";
import { vmResourceAccountingService } from "./VMResourceAccountingService";
import { buildVMCreationTask, buildVMTaskStatusUpdate } from "./VMTaskFactory";
import { vmTaskRepository } from "./VMTaskRepository";

type VMTaskRepositoryPort = {
    createTask(task: VM_Task): Promise<unknown>;
    updateTask(taskId: string, update: unknown): Promise<unknown>;
    listUserTaskRefsNewestFirst(userId: string): Promise<any[]>;
    deleteTasksByIds(taskIds: string[]): Promise<unknown>;
};

type VMRepositoryPort = {
    createUserOwnedVM(input: { userId: string; pveVmid: string; pveNode: string; fromTemplateId?: string }): Promise<string>;
    markAsBoxVM(vmId: string, boxId: string): Promise<unknown>;
    findByPVE(pveVmid: string, pveNode: string): Promise<any | null>;
    deleteVMRecord(vmId: string): Promise<unknown>;
    detachOwnedVM(userId: string, vmId: unknown): Promise<unknown>;
};

type VMUtilsPort = {
    cloneVM(
        sourceNode: string,
        sourceVmid: string,
        nextId: string,
        sanitizedName: string,
        targetNode: string,
        storage: string,
        full: string
    ): Promise<{ success: boolean; upid?: string; errorMessage?: string }>;
};

type VMConfigExecutionPort = {
    configureClonedVM(input: {
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
    }): Promise<{ success: boolean; errorMessage?: string }>;
};

type VMResourceAccountingPort = {
    incrementUsage(userId: string, cpuCores: number, memorySize: number, diskSize: number): Promise<void>;
};

type PVEClientPort = {
    request(method: "DELETE", url: string): Promise<unknown>;
};

export type VMCreationWorkflowServiceDeps = {
    tasks?: VMTaskRepositoryPort;
    vms?: VMRepositoryPort;
    vmUtils?: VMUtilsPort;
    configExecution?: VMConfigExecutionPort;
    resourceAccounting?: VMResourceAccountingPort;
    pveClient?: PVEClientPort;
};

export class VMCreationWorkflowService {
    private readonly tasks: VMTaskRepositoryPort;
    private readonly vms: VMRepositoryPort;
    private readonly vmUtils: VMUtilsPort;
    private readonly configExecution: VMConfigExecutionPort;
    private readonly resourceAccounting: VMResourceAccountingPort;
    private readonly pveClient: PVEClientPort;

    constructor(deps: VMCreationWorkflowServiceDeps = {}) {
        this.tasks = deps.tasks ?? vmTaskRepository;
        this.vms = deps.vms ?? vmRepository;
        this.vmUtils = deps.vmUtils ?? VMUtils;
        this.configExecution = deps.configExecution ?? vmConfigExecutionService;
        this.resourceAccounting = deps.resourceAccounting ?? vmResourceAccountingService;
        this.pveClient = deps.pveClient ?? pveClient;
    }

    public async cloneConfigureAndRegisterVM(input: {
        user: User;
        templateId: string;
        templateInfo: VM_Template;
        nextId: string;
        sanitizedName: string;
        target: string;
        storage: string;
        full: string;
        cpuCores: number;
        memorySize: number;
        diskSize: number;
        ciuser?: string;
        cipassword?: string;
        boxId?: string;
    }): Promise<resp<PVEResp | undefined>> {
        const userId = input.user._id!.toString();
        await this.cleanupUserOldTasks(userId, 20);

        const task = await this.createVMTask(
            input.templateId,
            userId,
            input.nextId,
            input.templateInfo.pve_vmid,
            input.target
        );
        logger.info(`Created VM task ${task.task_id} for user ${input.user.username}, VM ID: ${input.nextId}`);

        await this.cleanupOrphanCloudInitDisk(input.target, input.nextId, input.storage);

        const cloneResult = await this.vmUtils.cloneVM(
            input.templateInfo.pve_node,
            input.templateInfo.pve_vmid,
            input.nextId,
            input.sanitizedName,
            input.target,
            input.storage,
            input.full
        );

        await this.updateTaskStatus(task.task_id, cloneResult.success ? VM_Task_Status.IN_PROGRESS : VM_Task_Status.FAILED, cloneResult.upid, cloneResult.errorMessage);

        if (!cloneResult.success) {
            logger.error(`VM clone failed for user ${input.user.username}, task ${task.task_id}: ${cloneResult.errorMessage}`);
            return createResponse(500, VM_CLONE_FAILURE_MESSAGE);
        }

        const configResult = await this.configExecution.configureClonedVM({
            targetNode: input.target,
            vmid: input.nextId,
            cpuCores: input.cpuCores,
            memorySize: input.memorySize,
            diskSize: input.diskSize,
            cloneUpid: cloneResult.upid!,
            sourceNode: input.templateInfo.pve_node,
            taskId: task.task_id,
            ciuser: input.ciuser,
            cipassword: input.cipassword
        });

        if (configResult.success) {
            await this.resourceAccounting.incrementUsage(userId, input.cpuCores, input.memorySize, input.diskSize);
            const vmTableId = await this.updateUserOwnedVMs(userId, input.nextId, input.target, input.templateId);
            await this.updateTaskStatus(task.task_id, VM_Task_Status.COMPLETED, cloneResult.upid);

            if (input.boxId) {
                await this.vms.markAsBoxVM(vmTableId, input.boxId);
            }

            logger.info(`VM ${input.nextId} created successfully for user ${input.user.username}, task ${task.task_id}`);
            return createResponse(200, VM_CREATION_SUCCESS_MESSAGE, buildVMCreationSuccessBody({
                taskId: task.task_id,
                vmName: input.sanitizedName,
                vmid: input.nextId
            }));
        }

        await this.updateTaskStatus(task.task_id, VM_Task_Status.FAILED, cloneResult.upid, configResult.errorMessage);
        logger.error(`VM configuration failed for user ${input.user.username}, task ${task.task_id}: ${configResult.errorMessage}`);

        try {
            await this.cleanupFailedVMCreation(userId, input.nextId, input.target, task.task_id);
            logger.info(`Successfully cleaned up failed VM ${input.nextId} for user ${input.user.username}`);
        } catch (cleanupError) {
            logger.error(`Error during cleanup of failed VM ${input.nextId}:`, cleanupError);
        }

        return createResponse(500, VM_CONFIGURATION_CLEANED_UP_FAILURE_MESSAGE);
    }

    private async createVMTask(templateId: string, userId: string, vmid: string, templateVmid: string, targetNode: string): Promise<VM_Task> {
        const task = buildVMCreationTask({ templateId, userId, vmid, templateVmid, targetNode });
        await this.tasks.createTask(task);
        return task;
    }

    private async cleanupFailedVMCreation(userId: string, pveVmid: string, pveNode: string, taskId: string): Promise<void> {
        try {
            try {
                await this.pveClient.request('DELETE', pve_api.nodes_qemu_vm(pveNode, pveVmid));
                logger.info(`Successfully deleted VM ${pveVmid} from PVE node ${pveNode}`);
            } catch (pveError) {
                logger.warn(`Failed to delete VM ${pveVmid} from PVE: ${pveError}`);
            }

            const vmRecord = await this.vms.findByPVE(pveVmid, pveNode);
            if (vmRecord) {
                await this.vms.deleteVMRecord(vmRecord._id.toString());
                await this.vms.detachOwnedVM(userId, vmRecord._id);
            }

            await this.updateTaskStatus(taskId, VM_Task_Status.FAILED, undefined, "VM creation failed and resources have been cleaned up");
        } catch (error) {
            logger.error(`Error during failed VM cleanup:`, error);
        }
    }

    private async cleanupOrphanCloudInitDisk(pveNode: string, pveVmid: string, storage: string): Promise<void> {
        if (!storage) return;
        const volume = buildOrphanCloudInitVolume(storage, pveVmid);
        try {
            await this.pveClient.request('DELETE', pve_api.nodes_storage_content(pveNode, storage, encodeURIComponent(volume)));
            logger.info(`Deleted orphan cloud-init disk before clone: ${volume} on ${pveNode}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (isMissingCloudInitVolumeError(error)) {
                logger.info(`No orphan cloud-init disk found before clone: ${volume} on ${pveNode}`);
                return;
            }
            logger.warn(`Unable to delete orphan cloud-init disk ${volume} on ${pveNode}: ${message}`);
        }
    }

    private async updateUserOwnedVMs(userId: string, pveVmid: string, pveNode: string, fromTemplateId?: string): Promise<string> {
        try {
            return await this.vms.createUserOwnedVM({
                userId,
                pveVmid,
                pveNode,
                fromTemplateId
            });
        } catch (error) {
            logger.error(`Error updating user owned VMs for user ${userId}:`, error);
            throw error;
        }
    }

    private async updateTaskStatus(taskId: string, status: VM_Task_Status, upid?: string, errorMessage?: string): Promise<void> {
        try {
            const updateData = buildVMTaskStatusUpdate(status, upid, errorMessage);
            await this.tasks.updateTask(taskId, updateData);
        } catch (error) {
            logger.error(`Error updating task status for ${taskId}:`, error);
        }
    }

    private async cleanupUserOldTasks(userId: string, maxTasks: number): Promise<void> {
        try {
            const tasks = await this.tasks.listUserTaskRefsNewestFirst(userId);
            const taskIdsToDelete = selectOldVMTaskIdsForRetention(tasks, maxTasks);
            if (taskIdsToDelete.length > 0) {
                await this.tasks.deleteTasksByIds(taskIdsToDelete);
                logger.info(`Cleaned up ${taskIdsToDelete.length} old tasks for user ${userId}`);
            }
        } catch (error) {
            logger.error(`Error cleaning up old tasks for user ${userId}:`, error);
        }
    }
}

export const vmCreationWorkflowService = new VMCreationWorkflowService();
