import { Request } from "express";
import { Service } from "../abstract/Service";
import { logger } from "../middlewares/log";
import { createResponse, resp } from "../utils/resp";
import { validateTokenAndGetSuperAdminUser } from "../utils/auth";
import { User } from '../interfaces/User';
import { superAdminUserManagementService } from "../modules/super-admin/SuperAdminUserManagementService";

/**
 * Service for SuperAdmins to manage user-related administrative tasks.
 */
export class SuperAdminService extends Service {
    public async changeUserRole(request: Request): Promise<resp<undefined>> {
        try {
            const { user: actor, error } = await validateTokenAndGetSuperAdminUser<User>(request);
            if (error) {
                return createResponse(error.code, error.message);
            }

            const { userId, newRole } = request.body;
            return superAdminUserManagementService.changeUserRole({
                actor,
                userId,
                newRole
            });
        } catch (error: any) {
            logger.error(`Error changing user role: ${error.message}`);
            return createResponse(500, "Internal Server Error: " + error.message);
        }
    }

    public async assignCRPToUser(request: Request): Promise<resp<any | undefined>> {
        try {
            const { user: actor, error } = await validateTokenAndGetSuperAdminUser<User>(request);
            if (error) {
                return error;
            }

            const { userId, planId } = request.body;
            return superAdminUserManagementService.assignCRPToUser({
                actor,
                userId,
                planId
            });
        } catch (error: any) {
            logger.error(`Error assigning CRP to user: ${error.message}`);
            return createResponse(500, "Internal Server Error: " + error.message);
        }
    }

    public async getAllUsers(request: Request): Promise<resp<User[] | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<User[]>(request);
            if (error) {
                return error;
            }

            return superAdminUserManagementService.listRegularUsers(user);
        } catch (error) {
            logger.error(`Error getting all users: ${error}`);
            return createResponse(500, "Internal server error");
        }
    }

    public async getAllAdminUsers(request: Request): Promise<resp<User[] | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<User[]>(request);
            if (error) {
                return error;
            }

            return superAdminUserManagementService.listAdminUsers(user);
        } catch (error) {
            logger.error(`Error getting all admin users: ${error}`);
            return createResponse(500, "Internal server error");
        }
    }
}
