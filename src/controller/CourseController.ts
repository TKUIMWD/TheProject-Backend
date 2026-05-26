import { Controller } from "../abstract/Controller";
import { Request, Response } from "express";
import { CourseService, CourseServiceAdapterInput } from "../service/CourseService";
import { User } from "../interfaces/User";
import { logger } from "../middlewares/log";
import { validateTokenAndGetAdminUser, validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { createResponse, resp } from "../utils/resp";

type CourseTokenValidator = <T>(request: Request) => Promise<{ user: User; error?: resp<T | undefined> }>;

export class CourseController extends Controller {
  protected service: CourseService;

  constructor() {
    super();
    this.service = new CourseService();
  }

  public async getCourseById(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, validateTokenAndGetUser, "getCourseById", (input) =>
      this.service.getCourseById(input)
    );
    Response.status(resp.code).send(resp);
  }

  public async getCourseMenu(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, validateTokenAndGetUser, "getCourseMenu", (input) =>
      this.service.getCourseMenu(input)
    );
    Response.status(resp.code).send(resp);
  }

  public async AddCourse(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, validateTokenAndGetAdminUser, "AddCourse", (input) =>
      this.service.AddCourse(input)
    );
    Response.status(resp.code).send(resp);
  }

  public async UpdateCourseById(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, validateTokenAndGetAdminUser, "UpdateCourseById", (input) =>
      this.service.UpdateCourseById(input)
    );
    Response.status(resp.code).send(resp);
  }

  public async DeleteCourseById(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, validateTokenAndGetAdminUser, "DeleteCourseById", (input) =>
      this.service.DeleteCourseById(input)
    );
    Response.status(resp.code).send(resp);
  }

  public async GetAllPulicCourses(Request: Request, Response: Response) {
    const resp = await this.run("GetAllPublicCourses", () => this.service.GetAllPublicCourses());
    Response.status(resp.code).send(resp);
  }

  public async JoinCourseById(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, validateTokenAndGetUser, "JoinCourseById", (input) =>
      this.service.JoinCourseById(input)
    );
    Response.status(resp.code).send(resp);
  }

  public async rateCourse(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, validateTokenAndGetUser, "rateCourse", (input) =>
      this.service.rateCourse(input)
    );
    Response.status(resp.code).send(resp);
  }

  public async getCourseReviews(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, validateTokenAndGetUser, "getCourseReviews", (input) =>
      this.service.getCourseReviews(input)
    );
    Response.status(resp.code).send(resp);
  }

  public async updateCourseReview(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, validateTokenAndGetUser, "updateCourseReview", (input) =>
      this.service.updateCourseReview(input)
    );
    Response.status(resp.code).send(resp);
  }

  public async deleteCourseReview(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, validateTokenAndGetUser, "deleteCourseReview", (input) =>
      this.service.deleteCourseReview(input)
    );
    Response.status(resp.code).send(resp);
  }

  public async ApprovedCourseById(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, validateTokenAndGetSuperAdminUser, "ApprovedCourseById", (input) =>
      this.service.ApprovedCourseById(input)
    );
    Response.status(resp.code).send(resp);
  }

  public async UnApprovedCourseById(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, validateTokenAndGetSuperAdminUser, "UnApprovedCourseById", (input) =>
      this.service.UnApprovedCourseById(input)
    );
    Response.status(resp.code).send(resp);
  }

  public async InviteToJoinCourse(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, validateTokenAndGetAdminUser, "InviteToJoinCourse", (input) =>
      this.service.InviteToJoinCourse(input)
    );
    Response.status(resp.code).send(resp);
  }

  public async getFirstTemplateByCourseID(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, validateTokenAndGetUser, "getFirstTemplateByCourseID", (input) =>
      this.service.getFirstTemplateByCourseID(input)
    );
    Response.status(resp.code).send(resp);
  }

  public async getAllCourses(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, validateTokenAndGetSuperAdminUser, "getAllCourses", () =>
      this.service.getAllCourses()
    );
    Response.status(resp.code).send(resp);
  }

  public async getAllSubmittedCourses(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, validateTokenAndGetSuperAdminUser, "getAllSubmittedCourses", () =>
      this.service.getAllSubmittedCourses()
    );
    Response.status(resp.code).send(resp);
  }

  public async submitCourse(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, validateTokenAndGetAdminUser, "submitCourse", (input) =>
      this.service.submitCourse(input)
    );
    Response.status(resp.code).send(resp);
  }

  public async setCourseStatus(Request: Request, Response: Response) {
    const resp = await this.withAuthenticatedInput(Request, validateTokenAndGetAdminUser, "setCourseStatus", (input) =>
      this.service.setCourseStatus(input)
    );
    Response.status(resp.code).send(resp);
  }

  private async withAuthenticatedInput<T>(
    Request: Request,
    validator: CourseTokenValidator,
    actionName: string,
    action: (input: CourseServiceAdapterInput) => Promise<resp<T | undefined>>
  ): Promise<resp<T | undefined>> {
    return this.run(actionName, async () => {
      const { user, error } = await validator<T>(Request);
      if (error) {
        logger.warn(`Token validation failed in ${actionName}: ${error.message}`);
        return error;
      }

      return action(this.toAdapterInput(Request, user));
    });
  }

  private toAdapterInput(Request: Request, user: User): CourseServiceAdapterInput {
    return {
      user,
      params: Request.params,
      body: Request.body,
      query: Request.query
    };
  }

  private async run<T>(actionName: string, action: () => Promise<resp<T | undefined>>): Promise<resp<T | undefined>> {
    try {
      return await action();
    } catch (error) {
      logger.error(`Error in ${actionName}:`, error);
      return createResponse(500, "Internal Server Error");
    }
  }
}
