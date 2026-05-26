import { Request } from "express";
import { Service } from "../abstract/Service";
import { CloneTemplateResponse } from "../interfaces/Response/VMResp";
import { User } from "../interfaces/User";
import { logger } from "../middlewares/log";
import { templateManageRequestAdapterService } from "../modules/templates/TemplateManageRequestAdapterService";
import { validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { createResponse, resp } from "../utils/resp";

type TokenValidator = (request: Request) => Promise<{ user: User; error?: resp<any> }>;

export class TemplateManageService extends Service {
    public async updateTemplateConfig(Request: Request): Promise<resp<string | undefined>> {
        return this.withValidatedUser(
            Request,
            "updateTemplateConfig",
            (request) => validateTokenAndGetUser<User>(request),
            (user) => templateManageRequestAdapterService.updateTemplateConfig({
                user,
                body: Request.body
            })
        );
    }

    public async deleteTemplate(Request: Request): Promise<resp<string | undefined>> {
        return this.withValidatedUser(
            Request,
            "deleteTemplate",
            (request) => validateTokenAndGetUser<User>(request),
            (user) => templateManageRequestAdapterService.deleteTemplate({
                user,
                body: Request.body
            })
        );
    }

    public async cloneTemplate(Request: Request): Promise<resp<CloneTemplateResponse | undefined>> {
        return this.withValidatedUser(
            Request,
            "cloneTemplate",
            (request) => validateTokenAndGetSuperAdminUser<User>(request),
            (user) => templateManageRequestAdapterService.cloneTemplate({
                user,
                body: Request.body
            })
        );
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
                logger.warn(`Token validation failed in ${operation}: ${error.message}`);
                return createResponse(error.code, error.message);
            }

            return action(user);
        } catch (error) {
            logger.error(`Error in ${operation}:`, error);
            return createResponse(500, "Internal Server Error");
        }
    }
}
