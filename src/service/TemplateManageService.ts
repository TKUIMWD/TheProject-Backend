import { Request } from "express";
import { Service } from "../abstract/Service";
import { CloneTemplateResponse } from "../interfaces/Response/VMResp";
import { User } from "../interfaces/User";
import { logger } from "../middlewares/log";
import { templateManageRequestAdapterService } from "../modules/templates/TemplateManageRequestAdapterService";
import { validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { createResponse, resp } from "../utils/resp";

type TokenValidator = (request: Request) => Promise<{ user: User; error?: resp<any> }>;
type TemplateManageServiceInput = {
    user: User;
    body: Request["body"];
};

export class TemplateManageService extends Service {
    public async updateTemplateConfig(Request: Request): Promise<resp<string | undefined>> {
        return this.withValidatedUser(
            Request,
            "updateTemplateConfig",
            (request) => validateTokenAndGetUser<User>(request),
            (input) => templateManageRequestAdapterService.updateTemplateConfig(input)
        );
    }

    public async deleteTemplate(Request: Request): Promise<resp<string | undefined>> {
        return this.withValidatedUser(
            Request,
            "deleteTemplate",
            (request) => validateTokenAndGetUser<User>(request),
            (input) => templateManageRequestAdapterService.deleteTemplate(input)
        );
    }

    public async cloneTemplate(Request: Request): Promise<resp<CloneTemplateResponse | undefined>> {
        return this.withValidatedUser(
            Request,
            "cloneTemplate",
            (request) => validateTokenAndGetSuperAdminUser<User>(request),
            (input) => templateManageRequestAdapterService.cloneTemplate(input)
        );
    }

    private async withValidatedUser<T>(
        Request: Request,
        operation: string,
        validator: TokenValidator,
        action: (input: TemplateManageServiceInput) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        try {
            const { user, error } = await validator(Request);
            if (error) {
                logger.warn(`Token validation failed in ${operation}: ${error.message}`);
                return createResponse(error.code, error.message);
            }

            return action(this.toServiceInput(Request, user));
        } catch (error) {
            logger.error(`Error in ${operation}:`, error);
            return createResponse(500, "Internal Server Error");
        }
    }

    private toServiceInput(Request: Request, user: User): TemplateManageServiceInput {
        return {
            user,
            body: Request.body
        };
    }
}
