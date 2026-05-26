import { Service } from "../abstract/Service";
import { PVEResp } from "../interfaces/Response/PVEResp";
import { Request } from "express";
import { VMDeletionResponse, VMDeletionUserValidation } from "../interfaces/Response/VMResp";
import { User } from "../interfaces/User";
import { logger } from "../middlewares/log";
import { validateTokenAndGetUser, getTokenRole, validateTokenAndGetSuperAdminUser } from "../utils/auth";
import { resp, createResponse } from "../utils/resp";
import { validateObjectIdInput } from "../modules/common/ObjectIdPolicy";
import { canDeleteVMByOwnership } from "../modules/vm/VMDeletionPolicy";
import { vmRepository } from "../modules/vm/VMRepository";
import { vmDeletionWorkflowService } from "../modules/vm/VMDeletionWorkflowService";
import { vmConfigUpdateWorkflowService } from "../modules/vm/VMConfigUpdateWorkflowService";
import { vmCreationRequestService } from "../modules/vm/VMCreationRequestService";


export class VMManageService extends Service {
    // 創建 VM 從範本
    public async createVMFromTemplate(Request: Request): Promise<resp<PVEResp | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                logger.error("Error validating token for createVMFromTemplate:", error);
                return createResponse(error.code, error.message);
            }

            return vmCreationRequestService.createFromTemplate({
                user,
                body: Request.body
            });
        } catch (error) {
            logger.error("Error in createVMFromTemplate:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // 刪除用戶擁有的 VM
    public async deleteUserVM(Request: Request): Promise<resp<VMDeletionResponse | undefined>> {
        try {
            const tokenRoleResult = await getTokenRole(Request);
            const token_role = tokenRoleResult.role;

            if (!token_role) {
                return createResponse(401, "Unable to determine user role");
            }

            // 根據角色驗證用戶並獲取正確的用戶類型
            const userValidation: VMDeletionUserValidation = await this._validateUserForVMDeletion(Request, token_role);

            if (userValidation.error) {
                return userValidation.error;
            }

            const user = userValidation.user;
            if (!user || !user._id) {
                return createResponse(401, "User not found or invalid");
            }

            return this.deleteUserVMForUser({
                user,
                tokenRole: token_role,
                vmId: Request.body.vm_id
            });
        } catch (error) {
            return createResponse(500, "Internal Server Error");
        }
    }

    public async deleteUserVMForUser(input: {
        user: User;
        tokenRole: string;
        vmId: unknown;
    }): Promise<resp<VMDeletionResponse | undefined>> {
        const vmIdResult = validateObjectIdInput(input.vmId, "vm_id");
        if (!vmIdResult.valid) {
            return createResponse(400, vmIdResult.message);
        }
        const normalizedVmId = vmIdResult.value;

        const ownershipDecision = canDeleteVMByOwnership({
            tokenRole: input.tokenRole,
            ownedVmIds: input.user.owned_vms,
            vmId: normalizedVmId
        });
        if (!ownershipDecision.allowed) {
            return createResponse(403, ownershipDecision.message);
        }

        const vm = await vmRepository.findById(normalizedVmId);
        if (!vm) {
            return createResponse(404, "VM not found");
        }

        return vmDeletionWorkflowService.deleteUserVM({
            vmId: normalizedVmId,
            vm
        });
    }

    // 驗證用戶是否有權限刪除 VM
    private async _validateUserForVMDeletion(Request: Request, token_role: string): Promise<VMDeletionUserValidation> {
        try {
            if (token_role === 'superadmin') {
                const { user, error } = await validateTokenAndGetSuperAdminUser<User>(Request);
                return { user, error };
            } else {
                const { user, error } = await validateTokenAndGetUser<User>(Request);
                return { user, error };
            }
        } catch (error) {
            return {
                user: null,
                error: createResponse(500, "Error validating user")
            };
        }
    }
    // 更新 VM 配置
    public async updateVMConfig(Request: Request): Promise<resp<PVEResp | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                logger.error("Error validating token for updateVMConfig:", error);
                return createResponse(error.code, error.message);
            }

            return vmConfigUpdateWorkflowService.updateVMConfig({ user, body: Request.body });
        } catch (error) {
            logger.error("Error in updateVMConfig:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async createVMFromBoxTemplate(Request: Request): Promise<resp<PVEResp | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                logger.error("Error validating token for createVMFromBoxTemplate:", error);
                return createResponse(error.code, error.message);
            }
            return vmCreationRequestService.createFromBoxTemplate({
                user,
                body: Request.body
            });
            
        } catch (error) {
            logger.error("Error creating VM from box template:", error);
            return createResponse(500, "Internal server error");
        }
    }
}
