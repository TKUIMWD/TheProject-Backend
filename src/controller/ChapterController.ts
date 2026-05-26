import { Controller } from "../abstract/Controller";
import { Request, Response } from "express";
import { ChapterService } from "../service/ChapterService";
import { logger } from "../middlewares/log";
import { validateTokenAndGetAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { createResponse, resp } from "../utils/resp";

export class ChapterController extends Controller {
  protected service: ChapterService;

  constructor() {
    super();
    this.service = new ChapterService();
  }

  public async getChapterById(Request: Request, Response: Response) {
    const resp = await this.withUser(Request, "getChapterById", (user) => this.service.getChapterById({
      user,
      params: Request.params
    }));
    Response.status(resp.code).send(resp);
  }

  public async AddChapterToClass(Request: Request, Response: Response) {
    const resp = await this.withAdminUser(Request, "AddChapterToClass", (user) => this.service.AddChapterToClass({
      user,
      params: Request.params,
      body: Request.body
    }));
    Response.status(resp.code).send(resp);
  }

  public async UpdateChapterById(Request: Request, Response: Response) {
    const resp = await this.withAdminUser(Request, "UpdateChapterById", (user) => this.service.UpdateChapterById({
      user,
      params: Request.params,
      body: Request.body
    }));
    Response.status(resp.code).send(resp);
  }

  public async DeleteChapterById(Request: Request, Response: Response) {
    const resp = await this.withAdminUser(Request, "DeleteChapterById", (user) => this.service.DeleteChapterById({
      user,
      params: Request.params
    }));
    Response.status(resp.code).send(resp);
  }

  private async withUser<T>(
    Request: Request,
    actionName: string,
    action: (user: any) => Promise<resp<T | undefined>>
  ): Promise<resp<T | undefined>> {
    try {
      const { user, error } = await validateTokenAndGetUser<T>(Request);
      if (error) {
        return error;
      }

      return action(user);
    } catch (err) {
      logger.error(`Error in ${actionName}:`, err);
      return createResponse(500, "Internal Server Error");
    }
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
