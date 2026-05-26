import { Controller } from "../abstract/Controller";
import { Request, Response } from "express";
import { VMDeletionUserValidation } from "../interfaces/Response/VMResp";
import { User } from "../interfaces/User";
import { logger } from "../middlewares/log";
import { VMManageService } from "../service/VMManageService";
import { getTokenRole, validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { createResponse, resp } from "../utils/resp";

export class VMManageController extends Controller {
    protected service: VMManageService;

    constructor() {
        super();
        this.service = new VMManageService();
    }

    public async createVMFromTemplate(Request: Request, Response: Response) {
        const resp = await this.withValidatedUser(Request, "createVMFromTemplate", "Internal Server Error", validateTokenAndGetUser, (user) =>
            this.service.createVMFromTemplate({
                user,
                body: Request.body
            })
        );
        Response.status(resp.code).send(resp);
    }

    public async deleteUserVM(Request: Request, Response: Response) {
        const resp = await this.handleDeleteUserVM(Request);
        Response.status(resp.code).send(resp);
    }

    public async updateVMConfig(Request: Request, Response: Response) {
        const resp = await this.withValidatedUser(Request, "updateVMConfig", "Internal Server Error", validateTokenAndGetUser, (user) =>
            this.service.updateVMConfig({
                user,
                body: Request.body
            })
        );
        Response.status(resp.code).send(resp);
    }

    public async createVMFromBoxTemplate(Request: Request, Response: Response) {
        const resp = await this.withValidatedUser(Request, "createVMFromBoxTemplate", "Internal server error", validateTokenAndGetUser, (user) =>
            this.service.createVMFromBoxTemplate({
                user,
                body: Request.body
            })
        );
        Response.status(resp.code).send(resp);
    }

    private async handleDeleteUserVM(Request: Request): Promise<resp<any>> {
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

            return this.service.deleteUserVM({
                user,
                tokenRole: token_role,
                body: Request.body
            });
        } catch (error) {
            logger.error("Error in deleteUserVM:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    private async withValidatedUser<T>(
        Request: Request,
        operation: string,
        internalErrorMessage: string,
        validator: (request: Request) => Promise<{ user: User; error?: resp<any> }>,
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
