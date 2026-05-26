import { Request } from "express";
import { Service } from "../abstract/Service";
import { PVEResp } from "../interfaces/Response/PVEResp";
import { VMDeletionResponse, VMDeletionUserValidation } from "../interfaces/Response/VMResp";
import { User } from "../interfaces/User";
import { logger } from "../middlewares/log";
import { vmManageRequestAdapterService } from "../modules/vm/VMManageRequestAdapterService";
import { getTokenRole, validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { createResponse, resp } from "../utils/resp";

type TokenValidator = (request: Request) => Promise<{ user: User; error?: resp<any> }>;

export class VMManageService extends Service {
    public async createVMFromTemplate(Request: Request): Promise<resp<PVEResp | undefined>> {
        return this.withValidatedUser(
            Request,
            "createVMFromTemplate",
            "Internal Server Error",
            (request) => validateTokenAndGetUser<User>(request),
            (user) => vmManageRequestAdapterService.createVMFromTemplate({
                user,
                body: Request.body
            })
        );
    }

    public async deleteUserVM(Request: Request): Promise<resp<VMDeletionResponse | undefined>> {
        try {
            const tokenRoleResult = await getTokenRole(Request);
            const token_role = tokenRoleResult.role;

            if (!token_role) {
                return createResponse(401, "Unable to determine user role");
            }

            const userValidation: VMDeletionUserValidation = await this.validateUserForVMDeletion(Request, token_role);
            if (userValidation.error) {
                return userValidation.error;
            }

            const user = userValidation.user;
            if (!user || !user._id) {
                return createResponse(401, "User not found or invalid");
            }

            return vmManageRequestAdapterService.deleteUserVM({
                user,
                tokenRole: token_role,
                body: Request.body
            });
        } catch (error) {
            logger.error("Error in deleteUserVM:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async updateVMConfig(Request: Request): Promise<resp<PVEResp | undefined>> {
        return this.withValidatedUser(
            Request,
            "updateVMConfig",
            "Internal Server Error",
            (request) => validateTokenAndGetUser<User>(request),
            (user) => vmManageRequestAdapterService.updateVMConfig({
                user,
                body: Request.body
            })
        );
    }

    public async createVMFromBoxTemplate(Request: Request): Promise<resp<PVEResp | undefined>> {
        return this.withValidatedUser(
            Request,
            "createVMFromBoxTemplate",
            "Internal server error",
            (request) => validateTokenAndGetUser<User>(request),
            (user) => vmManageRequestAdapterService.createVMFromBoxTemplate({
                user,
                body: Request.body
            })
        );
    }

    private async withValidatedUser<T>(
        Request: Request,
        operation: string,
        internalErrorMessage: string,
        validator: TokenValidator,
        action: (user: User) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        try {
            const { user, error } = await validator(Request);
            if (error) {
                logger.error(`Error validating token for ${operation}:`, error);
                return createResponse(error.code, error.message);
            }

            return action(user);
        } catch (error) {
            logger.error(`Error in ${operation}:`, error);
            return createResponse(500, internalErrorMessage);
        }
    }

    private async validateUserForVMDeletion(Request: Request, token_role: string): Promise<VMDeletionUserValidation> {
        try {
            if (token_role === "superadmin") {
                const { user, error } = await validateTokenAndGetSuperAdminUser<User>(Request);
                return { user, error };
            }

            const { user, error } = await validateTokenAndGetUser<User>(Request);
            return { user, error };
        } catch (error) {
            return {
                user: null,
                error: createResponse(500, "Error validating user")
            };
        }
    }
}
