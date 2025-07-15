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

  public async getAllApprovedTemplates(Request: Request, Response: Response) {
    const resp = await this.service.getAllApprovedTemplates(Request);
    Response.status(resp.code).send(resp);
  }
}
