import { Controller } from "../abstract/Controller";
import { Request, Response } from "express";
import { logger } from "../middlewares/log";
import { TemplateService } from "../service/TemplateService";
require('dotenv').config()

export class TemplateController extends Controller {
  protected service: TemplateService;

  constructor() {
    super();
    this.service = new TemplateService();
  }

  public async getAllTemplates(Request: Request, Response: Response) {
    const resp = await this.service.getAllTemplates(Request);
    Response.status(resp.code).send(resp);
  }

  public async getAccessableTemplates(Request: Request, Response: Response) {
    const resp = await this.service.getAccessableTemplates(Request);
    Response.status(resp.code).send(resp);
  }

  public async convertVMtoTemplate(Request: Request, Response: Response) {
    const resp = await this.service.convertVMtoTemplate(Request);
    Response.status(resp.code).send(resp);
  }

  public async submitTemplate(Request: Request, Response: Response) {
    const resp = await this.service.submitTemplate(Request);
    Response.status(resp.code).send(resp);
  }

  public async getAllSubmittedTemplates(Request: Request, Response: Response) {
    const resp = await this.service.getAllSubmittedTemplates(Request);
    Response.status(resp.code).send(resp);
  }

  public async auditSubmittedTemplate(Request: Request, Response: Response) {
    const resp = await this.service.auditSubmittedTemplate(Request);
    Response.status(resp.code).send(resp);
  }
}
