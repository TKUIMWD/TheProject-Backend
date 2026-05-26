import { Request } from "express";
import Roles from "../enum/role";
import { User } from "../interfaces/User";
import { SimplifiedNetworkInterface, VMDetailWithBasicConfig } from "../interfaces/VM/VM";
import { logger } from "../middlewares/log";
import { vmReadRequestAdapterService } from "../modules/vm/VMReadRequestAdapterService";
import { Service } from "../abstract/Service";
import { validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { createResponse, resp } from "../utils/resp";

type VMReadContext = { user: User; isSuperAdmin: boolean; error?: undefined } | { user?: undefined; isSuperAdmin?: undefined; error: resp<undefined> };
type TokenValidator = <T>(Request: Request) => Promise<{ user: any; error?: resp<T | undefined> }>;

export class VMService extends Service {
    public async getUserOwnedVMs(Request: Request): Promise<resp<VMDetailWithBasicConfig[] | undefined>> {
        return this.withValidatedUser(Request, "getUserOwnedVMs", validateTokenAndGetUser, (user) => vmReadRequestAdapterService.listUserOwnedVMs({ user }));
    }

    public async getAllVMs(Request: Request): Promise<resp<VMDetailWithBasicConfig[] | undefined>> {
        return this.withValidatedUser(Request, "getAllVMs", validateTokenAndGetSuperAdminUser, () => vmReadRequestAdapterService.listAllVMs());
    }

    public async getVMStatus(Request: Request): Promise<resp<{ status: string; uptime?: number; resourceUsage?: { cpu: number; memory: number } } | undefined>> {
        return this.withVMReadContext(Request, "getVMStatus", (context) => vmReadRequestAdapterService.getVMStatus({
            user: context.user,
            isSuperAdmin: context.isSuperAdmin,
            query: Request.query
        }), "Internal server error");
    }

    public async getVMNetworkInfo(Request: Request): Promise<resp<{ interfaces: SimplifiedNetworkInterface[] } | undefined>> {
        return this.withVMReadContext(Request, "getVMNetworkInfo", (context) => vmReadRequestAdapterService.getVMNetworkInfo({
            user: context.user,
            isSuperAdmin: context.isSuperAdmin,
            query: Request.query
        }), "Internal server error");
    }

    private async withValidatedUser<T>(
        Request: Request,
        actionName: string,
        validator: TokenValidator,
        action: (user: User) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        try {
            const { user, error } = await validator<T>(Request);
            if (error) {
                logger.error("Error validating token:", error);
                return createResponse(error.code, error.message);
            }

            return action(user);
        } catch (error) {
            logger.error(`Error in ${actionName}:`, error);
            return createResponse(500, "Internal Server Error");
        }
    }

    private async withVMReadContext<T>(
        Request: Request,
        actionName: string,
        action: (context: { user: User; isSuperAdmin: boolean }) => Promise<resp<T | undefined>>,
        errorMessage: string
    ): Promise<resp<T | undefined>> {
        try {
            const context = await this.getVMReadContext(Request);
            if (context.error) return context.error;

            return action(context);
        } catch (error) {
            logger.error(`Error in ${actionName}:`, error);
            return createResponse(500, errorMessage);
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
