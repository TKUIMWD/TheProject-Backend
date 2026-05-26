import { Controller } from "../abstract/Controller";
import { Request, Response } from "express";
import { logger } from "../middlewares/log";
import { TemplateService } from "../service/TemplateService";
import { User } from "../interfaces/User";
import { validateTokenAndGetAdminUser, validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { createResponse, resp } from "../utils/resp";

export class TemplateController extends Controller {
  protected service: TemplateService;

  constructor() {
    super();
    this.service = new TemplateService();
  }

  public async getAllTemplates(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, "getAllTemplates", validateTokenAndGetSuperAdminUser, () =>
      this.service.getAllTemplates()
    );
    Response.status(resp.code).send(resp);
  }

  public async getAccessableTemplates(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, "getAccessableTemplates", validateTokenAndGetUser, (user) =>
      this.service.getAccessableTemplates({
        user,
        body: Request.body
      })
    );
    Response.status(resp.code).send(resp);
  }

  public async convertVMtoTemplate(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, "convertVMtoTemplate", validateTokenAndGetUser, (user) =>
      this.service.convertVMtoTemplate({
        user,
        body: Request.body
      })
    );
    Response.status(resp.code).send(resp);
  }

  public async submitTemplate(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, "submitTemplate", validateTokenAndGetAdminUser, (user) =>
      this.service.submitTemplate({
        user,
        body: Request.body
      })
    );
    Response.status(resp.code).send(resp);
  }

  public async getAllSubmittedTemplates(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, "getAllSubmittedTemplates", validateTokenAndGetSuperAdminUser, () =>
      this.service.getAllSubmittedTemplates()
    );
    Response.status(resp.code).send(resp);
  }

  public async auditSubmittedTemplate(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, "auditSubmittedTemplate", validateTokenAndGetSuperAdminUser, (user) =>
      this.service.auditSubmittedTemplate({
        user,
        body: Request.body
      })
    );
    Response.status(resp.code).send(resp);
  }

  private async withAuthenticatedInput<T>(
    Request: Request,
    actionName: string,
    validator: <R>(request: Request) => Promise<{ user: User; error?: resp<R | undefined> }>,
    action: (user: User) => Promise<resp<T | undefined>>
  ): Promise<resp<T | undefined>> {
    try {
      const { user, error } = await validator<T>(Request);
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
