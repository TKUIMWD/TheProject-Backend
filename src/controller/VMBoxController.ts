import { Controller } from "../abstract/Controller";
import { Request, Response } from "express";
import { logger } from "../middlewares/log";
import { VMBoxService, VMBoxServiceAdapterInput } from "../service/VMBoxService";
import { User } from "../interfaces/User";
import { validateTokenAndGetAdminUser, validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { createResponse, resp } from "../utils/resp";

type VMBoxTokenValidator = <T>(request: Request) => Promise<{ user: User; error?: resp<T | undefined> }>;

export class VMBoxController extends Controller {
  protected service: VMBoxService;

  constructor() {
    super();
    this.service = new VMBoxService();
  }

  public async submitBox(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, validateTokenAndGetAdminUser, "submitBox", "admin", (input) =>
      this.service.submitBox(input)
    );
    Response.status(resp.code).send(resp);
  }

  public async auditBoxSubmission(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, validateTokenAndGetSuperAdminUser, "auditBoxSubmission", "super admin", (input) =>
      this.service.auditBoxSubmission(input)
    );
    Response.status(resp.code).send(resp);
  }

  public async getSubmittedBoxes(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, validateTokenAndGetSuperAdminUser, "getSubmittedBoxes", "super admin", () =>
      this.service.getSubmittedBoxes()
    );
    Response.status(resp.code).send(resp);
  }

  public async rateBox(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, validateTokenAndGetUser, "rateBox", "token", (input) =>
      this.service.rateBox(input)
    );
    Response.status(resp.code).send(resp);
  }

  public async getPublicBoxes(Request: Request, Response: Response) {
    const resp = await this.run("getPublicBoxes", () => this.service.getPublicBoxes());
    Response.status(resp.code).send(resp);
  }

  public async getPendingBoxes(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, validateTokenAndGetSuperAdminUser, "getPendingBoxes", "super admin", () =>
      this.service.getPendingBoxes()
    );
    Response.status(resp.code).send(resp);
  }

  public async updateBoxAiAssistantSetting(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, validateTokenAndGetAdminUser, "updateBoxAiAssistantSetting", "admin", (input) =>
      this.service.updateBoxAiAssistantSetting(input)
    );
    Response.status(resp.code).send(resp);
  }

  public async getBoxReviews(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, validateTokenAndGetUser, "getBoxReviews", "token", (input) =>
      this.service.getBoxReviews(input)
    );
    Response.status(resp.code).send(resp);
  }

  public async updateBoxReview(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, validateTokenAndGetUser, "updateBoxReview", "token", (input) =>
      this.service.updateBoxReview(input)
    );
    Response.status(resp.code).send(resp);
  }

  public async deleteBoxReview(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, validateTokenAndGetUser, "deleteBoxReview", "token", (input) =>
      this.service.deleteBoxReview(input)
    );
    Response.status(resp.code).send(resp);
  }

  public async submitBoxWriteup(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, validateTokenAndGetUser, "submitBoxWriteup", "token", (input) =>
      this.service.submitBoxWriteup(input)
    );
    Response.status(resp.code).send(resp);
  }

  public async getPublicBoxWriteups(Request: Request, Response: Response) {
    const resp = await this.run("getPublicBoxWriteups", () =>
      this.service.getPublicBoxWriteups(this.toAdapterInput(Request))
    );
    Response.status(resp.code).send(resp);
  }

  public async getMyBoxWriteups(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, validateTokenAndGetUser, "getMyBoxWriteups", "token", (input) =>
      this.service.getMyBoxWriteups(input)
    );
    Response.status(resp.code).send(resp);
  }

  public async getBoxWriteupSubmissions(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, validateTokenAndGetAdminUser, "getBoxWriteupSubmissions", "admin", (input) =>
      this.service.getBoxWriteupSubmissions(input)
    );
    Response.status(resp.code).send(resp);
  }

  public async reviewBoxWriteup(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, validateTokenAndGetAdminUser, "reviewBoxWriteup", "admin", (input) =>
      this.service.reviewBoxWriteup(input)
    );
    Response.status(resp.code).send(resp);
  }

  public async updateBoxWriteupVisibility(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, validateTokenAndGetAdminUser, "updateBoxWriteupVisibility", "admin", (input) =>
      this.service.updateBoxWriteupVisibility(input)
    );
    Response.status(resp.code).send(resp);
  }

  public async getMyAnswerRecord(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, validateTokenAndGetUser, "getMyAnswerRecord", "token", (input) =>
      this.service.getMyAnswerRecord(input)
    );
    Response.status(resp.code).send(resp);
  }

  public async submitBoxAnswer(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, validateTokenAndGetUser, "submitBoxAnswer", "token", (input) =>
      this.service.submitBoxAnswer(input)
    );
    Response.status(resp.code).send(resp);
  }

  private async withAuthenticatedInput<T>(
    Request: Request,
    validator: VMBoxTokenValidator,
    operationName: string,
    validationLabel: string,
    action: (input: VMBoxServiceAdapterInput) => Promise<resp<T | undefined>>
  ): Promise<resp<T | undefined>> {
    return this.run(operationName, async () => {
      const { user, error } = await validator<T>(Request);
      if (error) {
        logger.error(`Error validating ${validationLabel} token:`, error);
        return error;
      }

      return action(this.toAdapterInput(Request, user));
    });
  }

  private toAdapterInput(Request: Request, user?: User): VMBoxServiceAdapterInput {
    return {
      user,
      params: Request.params,
      body: Request.body,
      query: Request.query
    };
  }

  private async run<T>(
    operationName: string,
    action: () => Promise<resp<T | undefined>>
  ): Promise<resp<T | undefined>> {
    try {
      return await action();
    } catch (error) {
      logger.error(`Error in ${operationName}:`, error);
      return createResponse(500, "Internal Server Error");
    }
  }
}
