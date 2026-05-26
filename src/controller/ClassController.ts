import { Controller } from "../abstract/Controller";
import { Request, Response } from "express";
import { ClassService } from "../service/ClassService";
import { logger } from "../middlewares/log";
import { validateTokenAndGetAdminUser } from "../utils/auth";
import { createResponse, resp } from "../utils/resp";

export class ClassController extends Controller {
  protected service: ClassService;

  constructor() {
    super();
    this.service = new ClassService();
  }

  public async getClassById(Request: Request, Response: Response) {
    const resp = await this.withAdminUser(Request, "getClassById", (user) => this.service.getClassById({
      user,
      params: Request.params
    }));
    Response.status(resp.code).send(resp);
  }

  public async AddClassToCourse(Request: Request, Response: Response) {
    const resp = await this.withAdminUser(Request, "AddClassToCourse", (user) => this.service.AddClassToCourse({
      user,
      params: Request.params,
      body: Request.body
    }));
    Response.status(resp.code).send(resp);
  }

  public async UpdateClassById(Request: Request, Response: Response) {
    const resp = await this.withAdminUser(Request, "UpdateClassById", (user) => this.service.UpdateClassById({
      user,
      params: Request.params,
      body: Request.body
    }));
    Response.status(resp.code).send(resp);
  }

  public async DeleteClassById(Request: Request, Response: Response) {
    const resp = await this.withAdminUser(Request, "DeleteClassById", (user) => this.service.DeleteClassById({
      user,
      params: Request.params
    }));
    Response.status(resp.code).send(resp);
  }

  private async withAdminUser<T>(
    Request: Request,
    actionName: string,
    action: (user: any) => Promise<resp<T | undefined>>
  ): Promise<resp<T | undefined>> {
    try {
      const { user, error } = await validateTokenAndGetAdminUser<T>(Request);
      if (error) {
        return error;
      }

      return action(user);
    } catch (err) {
      logger.error(`Error in ${actionName}:`, err);
      return createResponse(500, "Internal Server Error");
    }
  }
}
