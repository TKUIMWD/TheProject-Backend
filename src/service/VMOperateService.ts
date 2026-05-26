import { Service } from "../abstract/Service";
import { resp, createResponse } from "../utils/resp";
import { Request } from "express";
import { validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { User } from "../interfaces/User";
import { logger } from "../middlewares/log";
import { VMOperation } from "../modules/vm/VMOperationPolicy";
import { vmOperationExecutionService } from "../modules/vm/VMOperationExecutionService";

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

            const isSuperAdmin = await this._isSuperAdmin(Request);
            return this.executeVMOperation({
                user,
                isSuperAdmin,
                vmId: Request.body.vm_id,
                operation
            });

        } catch (error) {
            logger.error(`Error in ${operation}VM:`, error);
            return createResponse(500, "Internal server error");
        }
    }

    public async executeVMOperation(input: {
        user: User;
        isSuperAdmin: boolean;
        vmId: unknown;
        operation: VMOperation;
    }): Promise<resp<any>> {
        return vmOperationExecutionService.execute(input);
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
