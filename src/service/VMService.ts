import { Request } from "express";
import Roles from "../enum/role";
import { User } from "../interfaces/User";
import { SimplifiedNetworkInterface, VMDetailWithBasicConfig } from "../interfaces/VM/VM";
import { logger } from "../middlewares/log";
import { vmReadService } from "../modules/vm/VMReadService";
import { Service } from "../abstract/Service";
import { validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { createResponse, resp } from "../utils/resp";

type VMReadContext =
    | { user: User; isSuperAdmin: boolean; error?: undefined }
    | { user?: undefined; isSuperAdmin?: undefined; error: resp<undefined> };

export class VMService extends Service {
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

    public async getAllVMs(Request: Request): Promise<resp<VMDetailWithBasicConfig[] | undefined>> {
        try {
            const { error } = await validateTokenAndGetSuperAdminUser<User>(Request);
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

    public async getVMStatus(Request: Request): Promise<resp<{ status: string; uptime?: number } | undefined>> {
        try {
            const context = await this.getVMReadContext(Request);
            if (context.error) return context.error;

            return vmReadService.getVMStatus({
                user: context.user,
                isSuperAdmin: context.isSuperAdmin,
                vmId: Request.query.vm_id
            });
        } catch (error) {
            logger.error("Error in getVMStatus:", error);
            return createResponse(500, "Internal server error");
        }
    }

    public async getVMNetworkInfo(Request: Request): Promise<resp<{ interfaces: SimplifiedNetworkInterface[] } | undefined>> {
        try {
            const context = await this.getVMReadContext(Request);
            if (context.error) return context.error;

            return vmReadService.getVMNetworkInfo({
                user: context.user,
                isSuperAdmin: context.isSuperAdmin,
                vmId: Request.query.vm_id
            });
        } catch (error) {
            logger.error("Error in getVMNetworkInfo:", error);
            return createResponse(500, "Internal server error");
        }
    }

    private async getVMReadContext(Request: Request): Promise<VMReadContext> {
        const { user: superAdminUser, error: superAdminError } = await validateTokenAndGetSuperAdminUser<User>(Request);
        if (!superAdminError && superAdminUser && superAdminUser.role === Roles.SuperAdmin) {
            return { user: superAdminUser, isSuperAdmin: true };
        }

        const { user, error } = await validateTokenAndGetUser<User>(Request);
        if (error) {
            logger.error("Error validating token:", error);
            return { error: createResponse(error.code, error.message) };
        }

        return { user, isSuperAdmin: false };
    }
}
