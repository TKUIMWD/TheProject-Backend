import { Request } from "express";
import { Service } from "../abstract/Service";
import { User } from "../interfaces/User";
import { PVEResp } from "../interfaces/Response/PVEResp";
import { logger } from "../middlewares/log";
import { PVEQemuConfigRole } from "../modules/pve/PVEQemuConfigAccessService";
import { pveRequestAdapterService } from "../modules/pve/PVERequestAdapterService";
import { getTokenRole, validateTokenAndGetAdminUser, validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { createResponse, resp } from "../utils/resp";

type TokenValidator = (request: Request) => Promise<{
    user: User;
    error?: resp<any>;
}>;

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
                user,
                query: Request.query
            }) as resp<PVEResp | undefined>;
        } catch (error) {
            logger.error("Error in getQemuConfig:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async getNodes(Request: Request): Promise<resp<PVEResp | undefined>> {
        return this.withValidatedUser(
            Request,
            "getNodes",
            (request) => validateTokenAndGetUser<PVEResp>(request),
            () => pveRequestAdapterService.getNodes()
        ) as Promise<resp<PVEResp | undefined>>;
    }

    // 檢視多個 VM 任務狀態的自定義接口
    public async getMultipleTasksStatus(Request: Request): Promise<resp<any>> {
        return this.withValidatedUser(
            Request,
            "getMultipleTasksStatus",
            (request) => validateTokenAndGetUser<User>(request),
            (user) => pveRequestAdapterService.getMultipleTasksStatus({
                user,
                body: Request.body
            })
        );
    }

    // 獲取用戶最新一筆的 VM 任務狀態
    public async getUserLatestTaskStatus(Request: Request): Promise<resp<any>> {
        return this.withValidatedUser(
            Request,
            "getUserLatestTaskStatus",
            (request) => validateTokenAndGetUser<User>(request),
            (user) => pveRequestAdapterService.getUserLatestTaskStatus({ user })
        );
    }

    // 獲取用戶所有 VM 任務的狀態
    public async getUserAllTasksStatus(Request: Request): Promise<resp<any>> {
        return this.withValidatedUser(
            Request,
            "getUserAllTasksStatus",
            (request) => validateTokenAndGetUser<User>(request),
            (user) => pveRequestAdapterService.getUserAllTasksStatus({
                user,
                query: Request.query
            })
        );
    }

    // 即時檢查 PVE 任務狀態並更新本地記錄
    public async refreshTaskStatus(Request: Request): Promise<resp<any>> {
        return this.withValidatedUser(
            Request,
            "refreshTaskStatus",
            (request) => validateTokenAndGetUser<User>(request),
            (user) => pveRequestAdapterService.refreshTaskStatus({
                user,
                body: Request.body
            })
        );
    }

    // 定期清理任務 - 可以設置為定時任務
    public async cleanupTasks(Request: Request): Promise<resp<any>> {
        return this.withValidatedUser(
            Request,
            "cleanupTasks",
            (request) => validateTokenAndGetSuperAdminUser<User>(request),
            () => pveRequestAdapterService.cleanupTasks()
        );
    }

    // 取得 PVE Datacenter 狀態
    public async getDatacenterStatus(Request: Request): Promise<resp<any>> {
        return this.withValidatedUser(
            Request,
            "getDatacenterStatus",
            (request) => validateTokenAndGetSuperAdminUser<User>(request),
            () => pveRequestAdapterService.getDatacenterStatus()
        );
    }

    private isQemuConfigRole(role: unknown): role is PVEQemuConfigRole {
        return role === "user" || role === "admin" || role === "superadmin";
    }

    private async withValidatedUser<T>(
        Request: Request,
        operation: string,
        validator: TokenValidator,
        action: (user: User) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        try {
            const { user, error } = await validator(Request);
            if (error) {
                logger.error("Error validating token:", error);
                return error;
            }

            return action(user);
        } catch (error) {
            logger.error(`Error in ${operation}:`, error);
            return createResponse(500, "Internal Server Error");
        }
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
