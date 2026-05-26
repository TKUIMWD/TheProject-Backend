import { Request } from "express";
import { Service } from "../abstract/Service";
import { User } from "../interfaces/User";
import { PVEResp } from "../interfaces/Response/PVEResp";
import { logger } from "../middlewares/log";
import { PVEQemuConfigRole } from "../modules/pve/PVEQemuConfigAccessService";
import { pveRequestAdapterService } from "../modules/pve/PVERequestAdapterService";
import { getTokenRole, validateTokenAndGetAdminUser, validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { createResponse, resp } from "../utils/resp";

type TokenValidator = (request: Request) => Promise<{ user: User; error?: resp<any> }>;
type PVEServiceAdapterInput = { user: User; body: any; query: Request["query"] };

export class PVEService extends Service {
    public async getQemuConfig(Request: Request): Promise<resp<PVEResp | undefined>> {
        try {
            const token_role = (await getTokenRole(Request)).role;
            if (!this.isQemuConfigRole(token_role)) {
                return createResponse(403, "Invalid role");
            }

            const { user, error } = await this.validateQemuConfigUser(Request, token_role);
            if (error) {
                logger.error("Error validating token:", error);
                return error;
            }

            return await pveRequestAdapterService.getQemuConfig({
                role: token_role,
                ...this.toAdapterInput(Request, user)
            }) as resp<PVEResp | undefined>;
        } catch (error) {
            logger.error("Error in getQemuConfig:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async getNodes(Request: Request): Promise<resp<PVEResp | undefined>> {
        return this.withValidatedInput(
            Request,
            "getNodes",
            (request) => validateTokenAndGetUser<PVEResp>(request),
            () => pveRequestAdapterService.getNodes()
        ) as Promise<resp<PVEResp | undefined>>;
    }

    public async getMultipleTasksStatus(Request: Request): Promise<resp<any>> {
        return this.withValidatedInput(
            Request,
            "getMultipleTasksStatus",
            (request) => validateTokenAndGetUser<User>(request),
            (input) => pveRequestAdapterService.getMultipleTasksStatus(input)
        );
    }

    public async getUserLatestTaskStatus(Request: Request): Promise<resp<any>> {
        return this.withValidatedInput(
            Request,
            "getUserLatestTaskStatus",
            (request) => validateTokenAndGetUser<User>(request),
            (input) => pveRequestAdapterService.getUserLatestTaskStatus(input)
        );
    }

    public async getUserAllTasksStatus(Request: Request): Promise<resp<any>> {
        return this.withValidatedInput(
            Request,
            "getUserAllTasksStatus",
            (request) => validateTokenAndGetUser<User>(request),
            (input) => pveRequestAdapterService.getUserAllTasksStatus(input)
        );
    }

    public async refreshTaskStatus(Request: Request): Promise<resp<any>> {
        return this.withValidatedInput(
            Request,
            "refreshTaskStatus",
            (request) => validateTokenAndGetUser<User>(request),
            (input) => pveRequestAdapterService.refreshTaskStatus(input)
        );
    }

    public async cleanupTasks(Request: Request): Promise<resp<any>> {
        return this.withValidatedInput(
            Request,
            "cleanupTasks",
            (request) => validateTokenAndGetSuperAdminUser<User>(request),
            () => pveRequestAdapterService.cleanupTasks()
        );
    }

    public async getDatacenterStatus(Request: Request): Promise<resp<any>> {
        return this.withValidatedInput(
            Request,
            "getDatacenterStatus",
            (request) => validateTokenAndGetSuperAdminUser<User>(request),
            () => pveRequestAdapterService.getDatacenterStatus()
        );
    }

    private isQemuConfigRole(role: unknown): role is PVEQemuConfigRole {
        return role === "user" || role === "admin" || role === "superadmin";
    }

    private async withValidatedInput<T>(
        Request: Request,
        operation: string,
        validator: TokenValidator,
        action: (input: PVEServiceAdapterInput) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        try {
            const { user, error } = await validator(Request);
            if (error) {
                logger.error("Error validating token:", error);
                return error;
            }

            return action(this.toAdapterInput(Request, user));
        } catch (error) {
            logger.error(`Error in ${operation}:`, error);
            return createResponse(500, "Internal Server Error");
        }
    }

    private toAdapterInput(Request: Request, user: User): PVEServiceAdapterInput {
        return {
            user,
            body: Request.body,
            query: Request.query
        };
    }

    private async validateQemuConfigUser(
        Request: Request,
        role: PVEQemuConfigRole
    ): Promise<{ user: User; error?: undefined } | { user?: undefined; error: resp<PVEResp | undefined> }> {
        if (role === "user") {
            return validateTokenAndGetUser<PVEResp>(Request);
        }

        if (role === "admin") {
            return validateTokenAndGetAdminUser<PVEResp>(Request);
        }

        return validateTokenAndGetSuperAdminUser<PVEResp>(Request);
    }
}
