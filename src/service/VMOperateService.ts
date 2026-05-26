import { Service } from "../abstract/Service";
import { resp, createResponse } from "../utils/resp";
import { Request } from "express";
import { validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { VMModel } from "../orm/schemas/VM/VMSchemas";
import { User } from "../interfaces/User";
import { VMUtils } from "../utils/VMUtils";
import { logger } from "../middlewares/log";
import { env } from "../config/env";
import {
    canOperateVM,
    getVMOperationMessages,
    validateVMOperationState,
    validateVMOperationTargetId,
    VMOperation
} from "../modules/vm/VMOperationPolicy";

type VMOperationResult = {
    success: boolean;
    upid?: string;
    errorMessage?: string;
};

export class VMOperateService extends Service {
    public async _isSuperAdmin(Request: Request): Promise<boolean> {
        const { user, error } = await validateTokenAndGetSuperAdminUser<User>(Request);
        return !error && user ? true : false;
    }

    private async _executeVMOperation(Request: Request, operation: VMOperation): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                logger.warn(`Token validation failed in ${operation}VM: ${error.message}`);
                return createResponse(error.code, error.message);
            }

            const vmIdDecision = validateVMOperationTargetId(Request.body.vm_id);
            if (!vmIdDecision.valid) {
                return createResponse(400, vmIdDecision.message);
            }
            const vm_id = vmIdDecision.vmId;
            const messages = getVMOperationMessages(operation);

            const vm = await VMModel.findOne({ _id: vm_id });
            if (!vm) {
                return createResponse(404, "VM not found");
            }

            const isSuperAdmin = await this._isSuperAdmin(Request);
            if (!canOperateVM(vm.owner, user._id.toString(), isSuperAdmin)) {
                return createResponse(403, "You don't have permission to operate this VM");
            }

            const statusResult = await VMUtils.getVMStatus(vm.pve_node, vm.pve_vmid);
            if (!statusResult) {
                return createResponse(500, "Failed to get VM status");
            }

            const stateDecision = validateVMOperationState(operation, statusResult.status);
            if (!stateDecision.allowed) {
                return createResponse(400, stateDecision.message);
            }

            const result = await this._invokeVMOperation(operation, vm.pve_node, vm.pve_vmid);
            if (!result.success) {
                logger.error(`${messages.failureMessage} ${vm_id}:`, result.errorMessage);
                return createResponse(500, result.errorMessage || messages.failureMessage);
            }

            if (messages.waitTaskLabel && result.upid) {
                const waitResult = await VMUtils.waitForTaskCompletion(vm.pve_node, result.upid, messages.waitTaskLabel);
                if (!waitResult.success) {
                    logger.error(`VM ${vm_id} ${messages.actionLabel} task failed:`, waitResult.errorMessage);
                    return createResponse(500, waitResult.errorMessage || messages.waitFailureMessage || `${messages.actionLabel} task failed`);
                }
            }

            let networkIdentityWarning: string | undefined;
            if (operation === "boot" && env.pve.bootNormalizeGuestNetwork) {
                networkIdentityWarning = await this._normalizeGuestNetworkIdentity(vm_id, vm.pve_node, vm.pve_vmid);
            }

            logger.info(`VM ${vm_id} ${messages.successLogLabel} successfully by user ${user.username}, UPID: ${result.upid}`);
            return createResponse(200, messages.successMessage, {
                upid: result.upid,
                ...(operation === "boot" ? { network_identity_warning: networkIdentityWarning } : {})
            });

        } catch (error) {
            logger.error(`Error in ${operation}VM:`, error);
            return createResponse(500, "Internal server error");
        }
    }

    private async _invokeVMOperation(operation: VMOperation, node: string, vmid: string): Promise<VMOperationResult> {
        switch (operation) {
            case "boot":
                return VMUtils.startVM(node, vmid);
            case "shutdown":
                return VMUtils.shutdownVM(node, vmid);
            case "poweroff":
                return VMUtils.stopVM(node, vmid);
            case "reboot":
                return VMUtils.rebootVM(node, vmid);
            case "reset":
                return VMUtils.resetVM(node, vmid);
        }
    }

    private async _normalizeGuestNetworkIdentity(vmId: string, node: string, vmid: string): Promise<string | undefined> {
        const identityResult = await VMUtils.ensureUniqueGuestNetworkIdentity(
            node,
            vmid,
            env.pve.bootGuestIdentityTimeoutMs
        );
        if (!identityResult.success) {
            const warning = identityResult.errorMessage || "Guest network identity normalization failed";
            logger.warn(`VM ${vmId} guest network identity normalization failed: ${warning}`);
            return warning;
        }

        logger.info(`VM ${vmId} guest network identity normalized: ${(identityResult.stdout || "").split(/\r?\n/).slice(-5).join(" | ")}`);
        return undefined;
    }

    /**
     * 啟動 VM (boot)
     */
    public async bootVM(Request: Request): Promise<resp<{ upid?: string; network_identity_warning?: string } | undefined>> {
        return this._executeVMOperation(Request, "boot");
    }

    /**
     * 正常關機 VM (shutdown)
     */
    public async shutdownVM(Request: Request): Promise<resp<{ upid?: string } | undefined>> {
        return this._executeVMOperation(Request, "shutdown");
    }

    /**
     * 強制停止 VM (poweroff)
     */
    public async poweroffVM(Request: Request): Promise<resp<{ upid?: string } | undefined>> {
        return this._executeVMOperation(Request, "poweroff");
    }

    /**
     * 重啟 VM (reboot)
     */
    public async rebootVM(Request: Request): Promise<resp<{ upid?: string } | undefined>> {
        return this._executeVMOperation(Request, "reboot");
    }

    /**
     * 重置 VM (reset) - 硬重置，類似按下電源按鈕
     */
    public async resetVM(Request: Request): Promise<resp<{ upid?: string } | undefined>> {
        return this._executeVMOperation(Request, "reset");
    }
}
