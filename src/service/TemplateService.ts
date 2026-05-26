import { Service } from "../abstract/Service";
import { resp, createResponse } from "../utils/resp";
import { Request } from "express";
import { validateTokenAndGetUser, validateTokenAndGetSuperAdminUser, validateTokenAndGetAdminUser } from "../utils/auth";
import { VM_Template_Info } from "../interfaces/VM/VM_Template";
import { SubmittedTemplateDetails } from "../interfaces/SubmittedTemplate";
import { User } from "../interfaces/User";
import { logger } from "../middlewares/log";
import { templateRequestAdapterService } from "../modules/templates/TemplateRequestAdapterService";

export class TemplateService extends Service {

    public async getAllTemplates(Request: Request): Promise<resp<VM_Template_Info[] | undefined>> {
        return this.withSuperAdminUser(Request, "getAllTemplates", () => templateRequestAdapterService.getAllTemplates());
    }

    public async getAccessableTemplates(Request: Request): Promise<resp<VM_Template_Info[] | undefined>> {
        return this.withUser(Request, "getAccessableTemplates", (user) => templateRequestAdapterService.getAccessibleTemplates({ user }));
    }

    public async convertVMtoTemplate(Request: Request): Promise<resp<string | undefined>> {
        return this.withUser(Request, "convertVMtoTemplate", (user) => templateRequestAdapterService.convertVMToTemplate({
            user,
            body: Request.body
        }));
    }

    public async submitTemplate(Request: Request): Promise<resp<string | undefined>> {
        return this.withAdminUser(Request, "submitTemplate", (user) => templateRequestAdapterService.submitTemplate({
            user,
            body: Request.body
        }));
    }

    /**
     * 獲取所有提交的模板 (僅限 superadmin)
     */
    public async getAllSubmittedTemplates(request: Request): Promise<resp<SubmittedTemplateDetails[] | undefined>> {
        return this.withSuperAdminUser(request, "getAllSubmittedTemplates", () => templateRequestAdapterService.getAllSubmittedTemplates());
    }


    public async auditSubmittedTemplate(request: Request): Promise<resp<string | undefined>> {
        return this.withSuperAdminUser(request, "auditSubmittedTemplate", (user) => templateRequestAdapterService.auditSubmittedTemplate({
            user,
            body: request.body
        }));
    }

    private async withUser<T>(
        request: Request,
        actionName: string,
        action: (user: User) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<T>(request);
            if (error) {
                logger.warn(`Token validation failed in ${actionName}: ${error.message}`);
                return error;
            }

            return action(user);
        } catch (error) {
            logger.error(`Error in ${actionName}:`, error);
            return createResponse(500, "Internal Server Error");
        }
    }

    private async withAdminUser<T>(
        request: Request,
        actionName: string,
        action: (user: User) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<T>(request);
            if (error) {
                logger.warn(`Token validation failed in ${actionName}: ${error.message}`);
                return error;
            }

            return action(user);
        } catch (error) {
            logger.error(`Error in ${actionName}:`, error);
            return createResponse(500, "Internal Server Error");
        }
    }

    private async withSuperAdminUser<T>(
        request: Request,
        actionName: string,
        action: (user: User) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<T>(request);
            if (error) {
                logger.warn(`Token validation failed in ${actionName}: ${error.message}`);
                return error;
            }

            return action(user);
        } catch (error) {
            logger.error(`Error in ${actionName}:`, error);
            return createResponse(500, "Internal Server Error");
        }
    }
}
