import { DeleteResult, UpdateResult } from "mongodb";
import { pve_api } from "../../enum/PVE_API";
import { VMDeletionResponse } from "../../interfaces/Response/VMResp";
import { PVEResp } from "../../interfaces/Response/PVEResp";
import { VMConfig } from "../../interfaces/VM/VM";
import { logger } from "../../middlewares/log";
import { resp, createResponse } from "../../utils/resp";
import { PVEUtils } from "../../utils/PVEUtils";
import { VMUtils } from "../../utils/VMUtils";
import { pveClient } from "../pve/PVEClient";
import {
    buildVMDeletionErrorResponse,
    buildVMDeletionPVEApiFailureMessage,
    buildVMDeletionSuccessResponse,
    checkVMDeletionPowerState,
    classifyVMDeletionResponse
} from "./VMDeletionPolicy";
import { vmRepository } from "./VMRepository";
import { vmResourceAccountingService } from "./VMResourceAccountingService";

type VMDeletionWorkflowVM = {
    owner: string;
    pve_node: string;
    pve_vmid: string;
};

type VMRepositoryPort = {
    deleteVMRecord(vmId: string): Promise<DeleteResult>;
    detachOwnedVM(userId: string, vmId: unknown): Promise<UpdateResult>;
};

type PVEClientPort = {
    request<T = unknown>(method: string, url: string): Promise<T>;
};

type VMUtilsPort = {
    getVMStatus(node: string, vmid: string): Promise<{ status?: string } | null | undefined>;
    getCurrentVMConfig(node: string, vmid: string): Promise<VMConfig | null>;
    waitForTaskCompletion(node: string, upid: string, operationType?: string): Promise<{ success: boolean; errorMessage?: string }>;
};

type VMResourceAccountingPort = {
    reclaimWithConfig(userId: string, vmConfig: VMConfig): Promise<void>;
};

export type VMDeletionWorkflowServiceDeps = {
    vmRepository?: VMRepositoryPort;
    pveClient?: PVEClientPort;
    vmUtils?: VMUtilsPort;
    resourceAccounting?: VMResourceAccountingPort;
};

export class VMDeletionWorkflowService {
    private readonly vmRepository: VMRepositoryPort;
    private readonly pveClient: PVEClientPort;
    private readonly vmUtils: VMUtilsPort;
    private readonly resourceAccounting: VMResourceAccountingPort;

    constructor(deps: VMDeletionWorkflowServiceDeps = {}) {
        this.vmRepository = deps.vmRepository ?? vmRepository;
        this.pveClient = deps.pveClient ?? pveClient;
        this.vmUtils = deps.vmUtils ?? VMUtils;
        this.resourceAccounting = deps.resourceAccounting ?? vmResourceAccountingService;
    }

    public async deleteUserVM(input: {
        vmId: string;
        vm: VMDeletionWorkflowVM;
    }): Promise<resp<VMDeletionResponse | undefined>> {
        const vmResourceOwnerId = input.vm.owner;

        const vmStatus = await this.vmUtils.getVMStatus(input.vm.pve_node, input.vm.pve_vmid);
        const powerStateDecision = checkVMDeletionPowerState(vmStatus);
        if (!powerStateDecision.allowed) {
            return createResponse(400, powerStateDecision.message);
        }

        let vmConfig: VMConfig | null = null;
        try {
            vmConfig = await this.vmUtils.getCurrentVMConfig(input.vm.pve_node, input.vm.pve_vmid);
            if (vmConfig) {
                logger.info(`[deleteUserVM] Retrieved VM config for resource reclaim: cores=${vmConfig.cores}, memory=${vmConfig.memory}, disk size=${PVEUtils.extractDiskSizeFromConfig(vmConfig.scsi0)}GB`);
            }
        } catch (configError) {
            logger.warn(`[deleteUserVM] Failed to get VM config for resource reclaim: ${configError}`);
        }

        try {
            logger.info(`[deleteUserVM] Attempting to delete VM from PVE: node=${input.vm.pve_node}, vmid=${input.vm.pve_vmid}`);
            let deleteResp: PVEResp | undefined;

            try {
                deleteResp = await this.pveClient.request('DELETE', pve_api.nodes_qemu_vm(input.vm.pve_node, input.vm.pve_vmid));
                logger.debug(`[deleteUserVM] PVE delete response received with data type: ${typeof deleteResp?.data}`);
            } catch (apiError) {
                logger.error(`[deleteUserVM] PVE API call failed:`, apiError);
                return createResponse(500, buildVMDeletionPVEApiFailureMessage(apiError));
            }

            const deletionResult = await this.processDeletionResponse(deleteResp, input.vm);

            if (!deletionResult.success) {
                logger.error(`[deleteUserVM] VM deletion failed: ${deletionResult.errorMessage}`);
                return createResponse(500, deletionResult.errorMessage || "VM deletion failed");
            }

            if (vmConfig) {
                try {
                    await this.resourceAccounting.reclaimWithConfig(vmResourceOwnerId, vmConfig);
                    logger.info(`[deleteUserVM] Successfully reclaimed resources for VM owner ${vmResourceOwnerId}`);
                } catch (resourceError) {
                    logger.error(`[deleteUserVM] Error reclaiming resources for user ${vmResourceOwnerId}:`, resourceError);
                }
            } else {
                logger.warn(`[deleteUserVM] No VM config available for resource reclaim`);
            }

            logger.info(`[deleteUserVM] Deletion success, cleaning up database for vm_id: ${input.vmId}`);

            await this.cleanupVMFromDatabase(vmResourceOwnerId, input.vmId);
            logger.debug(`[deleteUserVM] cleanupVMFromDatabase called for VM owner: ${vmResourceOwnerId}, vm_id: ${input.vmId}`);

            if (!deletionResult.taskId) {
                logger.info("[deleteUserVM] VM deletion completed without taskId");
            }

            const response = buildVMDeletionSuccessResponse({
                vmId: input.vmId,
                pveVmid: input.vm.pve_vmid,
                pveNode: input.vm.pve_node,
                taskId: deletionResult.taskId
            });

            return createResponse(200, "VM deletion completed successfully", response);
        } catch (deleteError) {
            logger.error(`[deleteUserVM] Error deleting VM from PVE: ${deleteError}`);

            return createResponse(500, "Failed to delete VM from PVE", buildVMDeletionErrorResponse({
                vmId: input.vmId,
                pveVmid: input.vm.pve_vmid,
                pveNode: input.vm.pve_node,
                error: deleteError
            }));
        }
    }

    private async cleanupVMFromDatabase(userId: string, vmId: string): Promise<void> {
        try {
            const deleteResult: DeleteResult = await this.vmRepository.deleteVMRecord(vmId);

            if (deleteResult.deletedCount === 0) {
                logger.warn(`VM ${vmId} not found in database during cleanup`);
            } else {
                logger.info(`Successfully deleted VM ${vmId} from database`);
            }

            const updateResult: UpdateResult = await this.vmRepository.detachOwnedVM(userId, vmId);

            if (updateResult.modifiedCount === 0) {
                logger.warn(`VM ${vmId} not found in user ${userId}'s owned_vms list`);
            } else {
                logger.info(`Successfully removed VM ${vmId} from user ${userId}'s owned_vms list`);
            }
        } catch (error) {
            logger.error(`Error cleaning up VM ${vmId} from database:`, error);
            throw error;
        }
    }

    private async processDeletionResponse(deleteResp: PVEResp | undefined, vm: { pve_node: string; pve_vmid: string }): Promise<{ success: boolean; taskId?: string; errorMessage?: string }> {
        const deletionDecision = classifyVMDeletionResponse(deleteResp);
        if (!deletionDecision.success) return deletionDecision;

        if (deletionDecision.mode === "immediate") {
            logger.info("[deleteUserVM] VM deletion completed immediately (data=null)");
            return { success: true };
        }

        const taskId = deletionDecision.taskId;
        logger.info(`[deleteUserVM] VM deletion task initiated with UPID: ${taskId}`);
        logger.info(`[deleteUserVM] Waiting for deletion task to complete, UPID: ${taskId}`);

        const waitResult = await this.vmUtils.waitForTaskCompletion(vm.pve_node, taskId, 'VM deletion');
        if (!waitResult.success) {
            return {
                success: false,
                errorMessage: `VM deletion task failed: ${waitResult.errorMessage}`
            };
        }

        return {
            success: true,
            taskId
        };
    }
}

export const vmDeletionWorkflowService = new VMDeletionWorkflowService();
