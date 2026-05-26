import { Service } from "../abstract/Service";
import { resp, createResponse } from "../utils/resp";
import { Request } from "express";
import { validateTokenAndGetUser, validateTokenAndGetSuperAdminUser } from "../utils/auth";
import { User } from "../interfaces/User";
import { logger } from "../middlewares/log";
import { CloneTemplateResponse } from "../interfaces/Response/VMResp";
import { templateDeletionService } from "../modules/templates/TemplateDeletionService";
import { templateCloneService } from "../modules/templates/TemplateCloneService";
import { templateConfigUpdateService } from "../modules/templates/TemplateConfigUpdateService";



export class TemplateManageService extends Service {
    /**
     * 更新模板配置
     */
    public async updateTemplateConfig(Request: Request): Promise<resp<string | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                logger.warn(`Token validation failed in updateTemplateConfig: ${error.message}`);
                return createResponse(error.code, error.message);
            }

            return templateConfigUpdateService.updateTemplateConfig({
                user,
                body: Request.body
            });

        } catch (error) {
            logger.error("Error in updateTemplateConfig:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * 刪除模板
     */
    public async deleteTemplate(Request: Request): Promise<resp<string | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                logger.warn(`Token validation failed in deleteTemplate: ${error.message}`);
                return createResponse(error.code, error.message);
            }

            const { template_id } = Request.body;
            return templateDeletionService.deleteTemplate({ user, templateId: template_id });

        } catch (error) {
            logger.error("Error in deleteTemplate:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * 克隆模板到新模板 (僅限 superadmin)
     */
    public async cloneTemplate(Request: Request): Promise<resp<CloneTemplateResponse | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<User>(Request);
            if (error) {
                logger.warn(`Token validation failed in cloneTemplate: ${error.message}`);
                return createResponse(error.code, error.message);
            }

            return templateCloneService.cloneTemplate({ user, body: Request.body });

        } catch (error) {
            logger.error("Error in cloneTemplate:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

}
