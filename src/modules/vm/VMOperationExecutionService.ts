import { User } from "../../interfaces/User";
import { logger } from "../../middlewares/log";
import { env } from "../../config/env";
import { VMUtils } from "../../utils/VMUtils";
import { createResponse, resp } from "../../utils/resp";
import { vmRepository } from "./VMRepository";
import {
    canOperateVM,
    getVMOperationMessages,
    validateVMOperationState,
    validateVMOperationTargetId,
    VMOperation
} from "./VMOperationPolicy";

type VMOperationVM = {
    owner: string;
    pve_node: string;
    pve_vmid: string;
};

type VMOperationResult = {
    success: boolean;
    upid?: string;
    errorMessage?: string;
};

type VMRepositoryPort = {
    findById(vmId: string): Promise<VMOperationVM | null>;
};

type VMUtilsPort = {
    getVMStatus(node: string, vmid: string): Promise<{ status?: string } | null | undefined>;
    startVM(node: string, vmid: string): Promise<VMOperationResult>;
    shutdownVM(node: string, vmid: string): Promise<VMOperationResult>;
    stopVM(node: string, vmid: string): Promise<VMOperationResult>;
    rebootVM(node: string, vmid: string): Promise<VMOperationResult>;
    resetVM(node: string, vmid: string): Promise<VMOperationResult>;
    waitForTaskCompletion(node: string, upid: string, operationType?: string): Promise<{ success: boolean; errorMessage?: string }>;
    ensureUniqueGuestNetworkIdentity(node: string, vmid: string, timeoutMs?: number): Promise<{ success: boolean; stdout?: string; errorMessage?: string }>;
};

export type VMOperationExecutionServiceDeps = {
    vmRepository?: VMRepositoryPort;
    vmUtils?: VMUtilsPort;
    config?: {
        bootNormalizeGuestNetwork: boolean;
        bootGuestIdentityTimeoutMs: number;
    };
};

export class VMOperationExecutionService {
    private readonly vmRepository: VMRepositoryPort;
    private readonly vmUtils: VMUtilsPort;
    private readonly config: {
        bootNormalizeGuestNetwork: boolean;
        bootGuestIdentityTimeoutMs: number;
    };

    constructor(deps: VMOperationExecutionServiceDeps = {}) {
        this.vmRepository = deps.vmRepository ?? vmRepository;
        this.vmUtils = deps.vmUtils ?? VMUtils;
        this.config = deps.config ?? env.pve;
    }

    public async execute(input: {
        user: User;
        isSuperAdmin: boolean;
        vmId: unknown;
        operation: VMOperation;
    }): Promise<resp<any>> {
        try {
            const vmIdDecision = validateVMOperationTargetId(input.vmId);
            if (!vmIdDecision.valid) {
                return createResponse(400, vmIdDecision.message);
            }
            const vmId = vmIdDecision.vmId;
            const messages = getVMOperationMessages(input.operation);

            const vm = await this.vmRepository.findById(vmId);
            if (!vm) {
                return createResponse(404, "VM not found");
            }

            if (!canOperateVM(vm.owner, input.user._id!.toString(), input.isSuperAdmin)) {
                return createResponse(403, "You don't have permission to operate this VM");
            }

            const statusResult = await this.vmUtils.getVMStatus(vm.pve_node, vm.pve_vmid);
            if (!statusResult) {
                return createResponse(500, "Failed to get VM status");
            }

            const stateDecision = validateVMOperationState(input.operation, statusResult.status || "unknown");
            if (!stateDecision.allowed) {
                return createResponse(400, stateDecision.message);
            }

            const result = await this.invokeVMOperation(input.operation, vm.pve_node, vm.pve_vmid);
            if (!result.success) {
                logger.error(`${messages.failureMessage} ${vmId}:`, result.errorMessage);
                return createResponse(500, result.errorMessage || messages.failureMessage);
            }

            if (messages.waitTaskLabel && result.upid) {
                const waitResult = await this.vmUtils.waitForTaskCompletion(vm.pve_node, result.upid, messages.waitTaskLabel);
                if (!waitResult.success) {
                    logger.error(`VM ${vmId} ${messages.actionLabel} task failed:`, waitResult.errorMessage);
                    return createResponse(500, waitResult.errorMessage || messages.waitFailureMessage || `${messages.actionLabel} task failed`);
                }
            }

            let networkIdentityWarning: string | undefined;
            if (input.operation === "boot" && this.config.bootNormalizeGuestNetwork) {
                networkIdentityWarning = await this.normalizeGuestNetworkIdentity(vmId, vm.pve_node, vm.pve_vmid);
            }

            logger.info(`VM ${vmId} ${messages.successLogLabel} successfully by user ${input.user.username}, UPID: ${result.upid}`);
            return createResponse(200, messages.successMessage, {
                upid: result.upid,
                ...(input.operation === "boot" ? { network_identity_warning: networkIdentityWarning } : {})
            });
        } catch (error) {
            logger.error(`Error in ${input.operation}VM:`, error);
            return createResponse(500, "Internal server error");
        }
    }

    private async invokeVMOperation(operation: VMOperation, node: string, vmid: string): Promise<VMOperationResult> {
        switch (operation) {
            case "boot":
                return this.vmUtils.startVM(node, vmid);
            case "shutdown":
                return this.vmUtils.shutdownVM(node, vmid);
            case "poweroff":
                return this.vmUtils.stopVM(node, vmid);
            case "reboot":
                return this.vmUtils.rebootVM(node, vmid);
            case "reset":
                return this.vmUtils.resetVM(node, vmid);
        }
    }

    private async normalizeGuestNetworkIdentity(vmId: string, node: string, vmid: string): Promise<string | undefined> {
        const identityResult = await this.vmUtils.ensureUniqueGuestNetworkIdentity(
            node,
            vmid,
            this.config.bootGuestIdentityTimeoutMs
        );
        if (!identityResult.success) {
            const warning = identityResult.errorMessage || "Guest network identity normalization failed";
            logger.warn(`VM ${vmId} guest network identity normalization failed: ${warning}`);
            return warning;
        }

        logger.info(`VM ${vmId} guest network identity normalized: ${(identityResult.stdout || "").split(/\r?\n/).slice(-5).join(" | ")}`);
        return undefined;
    }
}

export const vmOperationExecutionService = new VMOperationExecutionService();
