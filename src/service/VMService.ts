import { Service } from "../abstract/Service";
import { resp, createResponse } from "../utils/resp";
import { Request } from "express";
import { validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { User } from "../interfaces/User";
import { VMDetailWithBasicConfig, SimplifiedNetworkInterface } from "../interfaces/VM/VM";
import { logger } from "../middlewares/log";
import Roles from "../enum/role";
import { vmReadService } from "../modules/vm/VMReadService";

export class VMService extends Service {

    // 獲取用戶擁有的 VM 列表
    public async getUserOwnedVMs(Request: Request): Promise<resp<VMDetailWithBasicConfig[] | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                logger.error("Error validating token:", error);
                return createResponse(error.code, error.message);
            }

            return vmReadService.listUserOwnedVMs(user);
        } catch (error) {
            logger.error("Error in getUserOwnedVMs:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // superadmin get all vms
    public async getAllVMs(Request: Request): Promise<resp<VMDetailWithBasicConfig[] | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<User>(Request);
            if (error) {
                logger.error("Error validating token:", error);
                return createResponse(error.code, error.message);
            }

            return vmReadService.listAllVMs();
        } catch (error) {
            logger.error("Error in getAllVMs:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // 獲取 VM 當前狀態
    public async getVMStatus(Request: Request): Promise<resp<{ status: string, uptime?: number } | undefined>> {
        try {
            // 首先嘗試驗證為 superadmin
            const { user: superAdminUser, error: superAdminError } = await validateTokenAndGetSuperAdminUser<User>(Request);
            let user: User;
            let isSuperAdmin = false;

            if (!superAdminError && superAdminUser && superAdminUser.role === Roles.SuperAdmin) {
                user = superAdminUser;
                isSuperAdmin = true;
            } else {
                // 如果不是 superadmin，則驗證為普通用戶
                const { user: normalUser, error } = await validateTokenAndGetUser<User>(Request);
                if (error) {
                    logger.error("Error validating token:", error);
                    return createResponse(error.code, error.message);
                }
                user = normalUser;
            }

            return vmReadService.getVMStatus({
                user,
                isSuperAdmin,
                vmId: Request.query.vm_id
            });

        } catch (error) {
            logger.error("Error in getVMStatus:", error);
            return createResponse(500, "Internal server error");
        }
    }

    /**
     * 獲取 VM 網路資訊
     */
    public async getVMNetworkInfo(Request: Request): Promise<resp<{ interfaces: SimplifiedNetworkInterface[] } | undefined>> {
        try {
            // 首先嘗試驗證為 superadmin
            const { user: superAdminUser, error: superAdminError } = await validateTokenAndGetSuperAdminUser<User>(Request);
            let user: User;
            let isSuperAdmin = false;

            if (!superAdminError && superAdminUser && superAdminUser.role === Roles.SuperAdmin) {
                user = superAdminUser;
                isSuperAdmin = true;
            } else {
                // 如果不是 superadmin，則驗證為普通用戶
                const { user: normalUser, error } = await validateTokenAndGetUser<User>(Request);
                if (error) {
                    logger.error("Error validating token:", error);
                    return createResponse(error.code, error.message);
                }
                user = normalUser;
            }

            return vmReadService.getVMNetworkInfo({
                user,
                isSuperAdmin,
                vmId: Request.query.vm_id
            });

        } catch (error) {
            logger.error("Error in getVMNetworkInfo:", error);
            return createResponse(500, "Internal server error");
        }
    }

}
