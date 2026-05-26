import { Request } from "express";
import { Service } from "../abstract/Service";
import { User } from "../interfaces/User";
import { logger } from "../middlewares/log";
import { superAdminRequestAdapterService } from "../modules/super-admin/SuperAdminRequestAdapterService";
import { validateTokenAndGetSuperAdminUser } from "../utils/auth";
import { createResponse, resp } from "../utils/resp";

export class SuperAdminService extends Service {
    public async changeUserRole(request: Request): Promise<resp<undefined>> {
        return this.withSuperAdmin(request, "changeUserRole", "Error changing user role", (actor) =>
            superAdminRequestAdapterService.changeUserRole({
                actor,
                body: request.body
            })
        );
    }

    public async assignCRPToUser(request: Request): Promise<resp<any | undefined>> {
        return this.withSuperAdmin(request, "assignCRPToUser", "Error assigning CRP to user", (actor) =>
            superAdminRequestAdapterService.assignCRPToUser({
                actor,
                body: request.body
            })
        );
    }

    public async getAllUsers(request: Request): Promise<resp<User[] | undefined>> {
        return this.withSuperAdmin(request, "getAllUsers", "Error getting all users", (actor) =>
            superAdminRequestAdapterService.getAllUsers(actor),
            "Internal server error"
        );
    }

    public async getAllAdminUsers(request: Request): Promise<resp<User[] | undefined>> {
        return this.withSuperAdmin(request, "getAllAdminUsers", "Error getting all admin users", (actor) =>
            superAdminRequestAdapterService.getAllAdminUsers(actor),
            "Internal server error"
        );
    }

    private async withSuperAdmin<T>(
        request: Request,
        operation: string,
        errorLogPrefix: string,
        action: (actor: User) => Promise<resp<T | undefined>>,
        internalErrorMessage = "Internal Server Error"
    ): Promise<resp<T | undefined>> {
        try {
            const { user: actor, error } = await validateTokenAndGetSuperAdminUser<User>(request);
            if (error) {
                return createResponse(error.code, error.message);
            }

            return action(actor);
        } catch (error: any) {
            logger.error(`${errorLogPrefix}: ${error.message ?? error}`);
            return createResponse(500, error.message ? `${internalErrorMessage}: ${error.message}` : internalErrorMessage);
        }
    }
}
