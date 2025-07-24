import { Controller } from "../abstract/Controller";
import { Request, Response } from "express";
import { TemplateManageService } from "../service/TemplateManageService";
require('dotenv').config()

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
        const resp = await this.service.updateTemplateConfig(Request);
        Response.status(resp.code).send(resp);
    }

    /**
     * 刪除模板
     */
    public async deleteTemplate(Request: Request, Response: Response) {
        const resp = await this.service.deleteTemplate(Request);
        Response.status(resp.code).send(resp);
    }

    /**
     * 克隆模板到新模板
     */
    public async cloneTemplate(Request: Request, Response: Response) {
        const resp = await this.service.cloneTemplate(Request);
        Response.status(resp.code).send(resp);
    }
}
