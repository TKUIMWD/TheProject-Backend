import { Service } from "../abstract/Service";
import { resp, createResponse } from "../utils/resp";
import { PVEResp } from "../interfaces/Response/PVEResp";
import { Request } from "express";
import { getTokenRole, validateTokenAndGetAdminUser, validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { pve_api } from "../enum/PVE_API";
import { User } from "../interfaces/User";
import { pveClient } from "../modules/pve/PVEClient";
import { logger } from "../middlewares/log";
import { pveTaskService } from "../modules/pve/PVETaskService";
import { PVEQemuConfigRole, pveQemuConfigAccessService } from "../modules/pve/PVEQemuConfigAccessService";
import { pveDatacenterStatusService } from "../modules/pve/PVEDatacenterStatusService";


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

            return await pveQemuConfigAccessService.getQemuConfig({
                role: token_role,
                user,
                vmId: Request.query.id
            }) as resp<PVEResp | undefined>;
        } catch (error) {
            logger.error("Error in getQemuConfig:", error);
            return createResponse(500, "Internal Server Error");
        }
    }


    public async getNodes(Request: Request): Promise<resp<PVEResp | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<PVEResp>(Request);
            if (error) {
                logger.error("Error validating token:", error);
                return error;
            }
            const nodes: PVEResp = await pveClient.request('GET', pve_api.nodes, undefined, { mode: 'admin' });
            return createResponse(200, "Nodes fetched successfully", nodes.data);
        } catch (error) {
            logger.error("Error in getNodes:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // 檢視多個 VM 任務狀態的自定義接口
    public async getMultipleTasksStatus(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                logger.error("Error validating token:", error);
                return error;
            }

            const { task_ids } = Request.body;
            return pveTaskService.getMultipleTasksStatus({ user, taskIds: task_ids });
        } catch (error) {
            logger.error("Error in getMultipleTasksStatus:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // 獲取用戶最新一筆的 VM 任務狀態
    public async getUserLatestTaskStatus(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                logger.error("Error validating token:", error);
                return error;
            }
            return pveTaskService.getUserLatestTaskStatus(user);
        } catch (error) {
            logger.error("Error in getUserLatestTaskStatus:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // 獲取用戶所有 VM 任務的狀態
    public async getUserAllTasksStatus(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                logger.error("Error validating token:", error);
                return error;
            }

            return pveTaskService.getUserAllTasksStatus({
                user,
                page: Request.query.page,
                limit: Request.query.limit,
                status: Request.query.status
            });
        } catch (error) {
            logger.error("Error in getUserAllTasksStatus:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // 即時檢查 PVE 任務狀態並更新本地記錄
    public async refreshTaskStatus(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                logger.error("Error validating token:", error);
                return error;
            }

            const { task_id } = Request.body;
            return pveTaskService.refreshTaskStatus({ user, taskId: task_id });
        } catch (error) {
            logger.error("Error in refreshTaskStatus:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // 定期清理任務 - 可以設置為定時任務
    public async cleanupTasks(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<User>(Request);
            if (error) {
                logger.error("Error validating token:", error);
                return error;
            }

            return pveTaskService.cleanupTasks();
        } catch (error) {
            logger.error("Error in cleanupTasks:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // 取得 PVE Datacenter 狀態
    public async getDatacenterStatus(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<User>(Request);
            if (error) {
                logger.error("Error validating token:", error);
                return error;
            }

            return pveDatacenterStatusService.getDatacenterStatus();
        } catch (error) {
            logger.error("Error in getDatacenterStatus:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    private isQemuConfigRole(role: unknown): role is PVEQemuConfigRole {
        return role === "user" || role === "admin" || role === "superadmin";
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
