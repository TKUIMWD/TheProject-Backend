import { Controller } from "../abstract/Controller";
import { Request, Response } from "express";
import { TemplateManageService } from "../service/TemplateManageService";
import { User } from "../interfaces/User";
import { logger } from "../middlewares/log";
import { validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { createResponse, resp } from "../utils/resp";

export class TemplateManageController extends Controller {
    protected service: TemplateManageService;

    constructor() {
        super();
        this.service = new TemplateManageService();
    }

    /**
     * 更新模板配置
     */
    public async updateTemplateConfig(Request: Request, Response: Response) {
        const resp = await this.withValidatedUser(Request, "updateTemplateConfig", validateTokenAndGetUser, (user) =>
            this.service.updateTemplateConfig({
                user,
                body: Request.body
            })
        );
        Response.status(resp.code).send(resp);
    }

    /**
     * 刪除模板
     */
    public async deleteTemplate(Request: Request, Response: Response) {
        const resp = await this.withValidatedUser(Request, "deleteTemplate", validateTokenAndGetUser, (user) =>
            this.service.deleteTemplate({
                user,
                body: Request.body
            })
        );
        Response.status(resp.code).send(resp);
    }

    /**
     * 克隆模板到新模板
     */
    public async cloneTemplate(Request: Request, Response: Response) {
        const resp = await this.withValidatedUser(Request, "cloneTemplate", validateTokenAndGetSuperAdminUser, (user) =>
            this.service.cloneTemplate({
                user,
                body: Request.body
            })
        );
        Response.status(resp.code).send(resp);
    }

    private async withValidatedUser<T>(
        Request: Request,
        operation: string,
        validator: (request: Request) => Promise<{ user: User; error?: resp<any> }>,
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
