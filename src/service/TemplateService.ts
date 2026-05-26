import { Service } from "../abstract/Service";
import { resp, createResponse } from "../utils/resp";
import { Request } from "express";
import { validateTokenAndGetUser, validateTokenAndGetSuperAdminUser, validateTokenAndGetAdminUser } from "../utils/auth";
import { VM_Template_Info } from "../interfaces/VM/VM_Template";
import { SubmittedTemplateDetails } from "../interfaces/SubmittedTemplate";
import { User } from "../interfaces/User";
import { logger } from "../middlewares/log";
import { templateRequestAdapterService } from "../modules/templates/TemplateRequestAdapterService";

type TokenValidator = <T>(request: Request) => Promise<{ user: User; error?: resp<T | undefined> }>;
type TemplateServiceAdapterInput = { user: User; body: any };

export class TemplateService extends Service {

    public async getAllTemplates(Request: Request): Promise<resp<VM_Template_Info[] | undefined>> {
        return this.withSuperAdminInput(Request, "getAllTemplates", () => templateRequestAdapterService.getAllTemplates());
    }

    public async getAccessableTemplates(Request: Request): Promise<resp<VM_Template_Info[] | undefined>> {
        return this.withUserInput(Request, "getAccessableTemplates", (input) => templateRequestAdapterService.getAccessibleTemplates(input));
    }

    public async convertVMtoTemplate(Request: Request): Promise<resp<string | undefined>> {
        return this.withUserInput(Request, "convertVMtoTemplate", (input) => templateRequestAdapterService.convertVMToTemplate(input));
    }

    public async submitTemplate(Request: Request): Promise<resp<string | undefined>> {
        return this.withAdminInput(Request, "submitTemplate", (input) => templateRequestAdapterService.submitTemplate(input));
    }

    public async getAllSubmittedTemplates(request: Request): Promise<resp<SubmittedTemplateDetails[] | undefined>> {
        return this.withSuperAdminInput(request, "getAllSubmittedTemplates", () => templateRequestAdapterService.getAllSubmittedTemplates());
    }


    public async auditSubmittedTemplate(request: Request): Promise<resp<string | undefined>> {
        return this.withSuperAdminInput(request, "auditSubmittedTemplate", (input) =>
            templateRequestAdapterService.auditSubmittedTemplate(input)
        );
    }

    private async withUserInput<T>(
        request: Request,
        actionName: string,
        action: (input: TemplateServiceAdapterInput) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        return this.withAuthenticatedInput(request, actionName, validateTokenAndGetUser, action);
    }

    private async withAdminInput<T>(
        request: Request,
        actionName: string,
        action: (input: TemplateServiceAdapterInput) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        return this.withAuthenticatedInput(request, actionName, validateTokenAndGetAdminUser, action);
    }

    private async withSuperAdminInput<T>(
        request: Request,
        actionName: string,
        action: (input: TemplateServiceAdapterInput) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        return this.withAuthenticatedInput(request, actionName, validateTokenAndGetSuperAdminUser, action);
    }

    private async withAuthenticatedInput<T>(
        request: Request,
        actionName: string,
        validator: TokenValidator,
        action: (input: TemplateServiceAdapterInput) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        try {
            const { user, error } = await validator<T>(request);
            if (error) {
                logger.warn(`Token validation failed in ${actionName}: ${error.message}`);
                return error;
            }

            return action(this.toAdapterInput(request, user));
        } catch (error) {
            logger.error(`Error in ${actionName}:`, error);
            return createResponse(500, "Internal Server Error");
        }
    }

    private toAdapterInput(request: Request, user: User): TemplateServiceAdapterInput {
        return {
            user,
            body: request.body
        };
    }
}
