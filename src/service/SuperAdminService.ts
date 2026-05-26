import { Request } from "express";
import { Service } from "../abstract/Service";
import { User } from "../interfaces/User";
import { logger } from "../middlewares/log";
import { superAdminRequestAdapterService } from "../modules/super-admin/SuperAdminRequestAdapterService";
import { validateTokenAndGetSuperAdminUser } from "../utils/auth";
import { createResponse, resp } from "../utils/resp";

type SuperAdminServiceInput = {
    actor: User;
    body: Request["body"];
};

export class SuperAdminService extends Service {
    public async changeUserRole(request: Request): Promise<resp<undefined>> {
        return this.withSuperAdminInput(request, "changeUserRole", "Error changing user role", (input) =>
            superAdminRequestAdapterService.changeUserRole(input)
        );
    }

    public async assignCRPToUser(request: Request): Promise<resp<any | undefined>> {
        return this.withSuperAdminInput(request, "assignCRPToUser", "Error assigning CRP to user", (input) =>
            superAdminRequestAdapterService.assignCRPToUser(input)
        );
    }

    public async getAllUsers(request: Request): Promise<resp<User[] | undefined>> {
        return this.withSuperAdminInput(request, "getAllUsers", "Error getting all users", (input) =>
            superAdminRequestAdapterService.getAllUsers(input.actor),
            "Internal server error"
        );
    }

    public async getAllAdminUsers(request: Request): Promise<resp<User[] | undefined>> {
        return this.withSuperAdminInput(request, "getAllAdminUsers", "Error getting all admin users", (input) =>
            superAdminRequestAdapterService.getAllAdminUsers(input.actor),
            "Internal server error"
        );
    }

    private async withSuperAdminInput<T>(
        request: Request,
        operation: string,
        errorLogPrefix: string,
        action: (input: SuperAdminServiceInput) => Promise<resp<T | undefined>>,
        internalErrorMessage = "Internal Server Error"
    ): Promise<resp<T | undefined>> {
        try {
            const { user: actor, error } = await validateTokenAndGetSuperAdminUser<User>(request);
            if (error) {
                return createResponse(error.code, error.message);
            }

            return action(this.toServiceInput(request, actor));
        } catch (error: any) {
            logger.error(`${errorLogPrefix}: ${error.message ?? error}`);
            return createResponse(500, error.message ? `${internalErrorMessage}: ${error.message}` : internalErrorMessage);
        }
    }

    private toServiceInput(request: Request, actor: User): SuperAdminServiceInput {
        return {
            actor,
            body: request.body
        };
    }
}
