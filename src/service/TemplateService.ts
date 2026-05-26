import { Service } from "../abstract/Service";
import { resp, createResponse } from "../utils/resp";
import { Request } from "express";
import { validateTokenAndGetUser, validateTokenAndGetSuperAdminUser, validateTokenAndGetAdminUser } from "../utils/auth";
import { VM_Template_Info } from "../interfaces/VM/VM_Template";
import { SubmittedTemplateDetails } from "../interfaces/SubmittedTemplate";
import { User } from "../interfaces/User";
import { logger } from "../middlewares/log";
import { templateAuditService } from "../modules/templates/TemplateAuditService";
import { templateConversionService } from "../modules/templates/TemplateConversionService";
import { templateListService } from "../modules/templates/TemplateListService";
import { templateSubmissionCreateService } from "../modules/templates/TemplateSubmissionCreateService";

export class TemplateService extends Service {

    public async getAllTemplates(Request: Request): Promise<resp<VM_Template_Info[] | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<VM_Template_Info[]>(Request);
            if (error) {
                logger.warn(`Token validation failed in getAllTemplates: ${error.message}`);
                return error;
            }

            return templateListService.listAllTemplates();
        } catch (error) {
            logger.error("Error in getAllTemplates:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async getAccessableTemplates(Request: Request): Promise<resp<VM_Template_Info[] | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<VM_Template_Info[]>(Request);
            if (error) {
                logger.warn(`Token validation failed in getAccessableTemplates: ${error.message}`);
                return error;
            }

            return templateListService.listAccessibleTemplates(user);
        } catch (error) {
            logger.error("Error in getAllApprovedTemplates:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async convertVMtoTemplate(Request: Request): Promise<resp<string | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<string>(Request);
            if (error) {
                logger.warn(`Token validation failed in convertVMtoTemplate: ${error.message}`);
                return error;
            }

            return templateConversionService.convertVMToTemplate({
                user,
                body: Request.body
            });

        } catch (error) {
            logger.error("Error in convertVMtoTemplate:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async submitTemplate(Request: Request): Promise<resp<string | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<string>(Request);
            if (error) {
                logger.warn(`Token validation failed in submitTemplate: ${error.message}`);
                return error;
            }

            return templateSubmissionCreateService.submitTemplate({
                user,
                body: Request.body
            });
        } catch (error) {
            logger.error("Error in submitTemplate:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * 獲取所有提交的模板 (僅限 superadmin)
     */
    public async getAllSubmittedTemplates(request: Request): Promise<resp<SubmittedTemplateDetails[] | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<User>(request);
            if (error) {
                logger.warn(`Token validation failed in getAllSubmittedTemplates: ${error.message}`);
                return createResponse(error.code, error.message);
            }

            return templateListService.listSubmittedTemplates();

        } catch (error) {
            logger.error("Error in getAllSubmittedTemplates:", error);
            return createResponse(500, "Internal Server Error");
        }
    }


    public async auditSubmittedTemplate(request: Request): Promise<resp<string | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<User>(request);
            if (error) {
                logger.warn(`Token validation failed in auditSubmittedTemplate: ${error.message}`);
                return createResponse(error.code, error.message);
            }

            return templateAuditService.auditSubmittedTemplate({ user, body: request.body });
        } catch (error) {
            logger.error("Error in auditSubmittedTemplate:", error);
            return createResponse(500, "Internal Server Error");
        }
    }
}
