import { Controller } from "../abstract/Controller";
import { Request, Response } from "express";
import { User } from "../interfaces/User";
import { PVEResp } from "../interfaces/Response/PVEResp";
import { logger } from "../middlewares/log";
import { PVEQemuConfigRole } from "../modules/pve/PVEQemuConfigAccessService";
import { PVEService } from "../service/PVEService";
import { getTokenRole, validateTokenAndGetAdminUser, validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { createResponse, resp } from "../utils/resp";

export class PVEController extends Controller {
  protected service: PVEService;

  constructor() {
    super();
    this.service = new PVEService();
  }

  public async getNodes(Request: Request, Response: Response) {
    const resp = await this.withValidatedInput(Request, "getNodes", validateTokenAndGetUser, () => this.service.getNodes())
    Response.status(resp.code).send(resp)
  }

  public async getQemuConfig(Request: Request, Response: Response) {
    const resp = await this.handleQemuConfig(Request);
    Response.status(resp.code).send(resp);
  }

  public async getMultipleTasksStatus(Request: Request, Response: Response) {
    const resp = await this.withValidatedInput(Request, "getMultipleTasksStatus", validateTokenAndGetUser, (user) =>
      this.service.getMultipleTasksStatus(this.toAdapterInput(Request, user))
    );
    Response.status(resp.code).send(resp);
  }

  public async getUserAllTasksStatus(Request: Request, Response: Response) {
    const resp = await this.withValidatedInput(Request, "getUserAllTasksStatus", validateTokenAndGetUser, (user) =>
      this.service.getUserAllTasksStatus(this.toAdapterInput(Request, user))
    );
    Response.status(resp.code).send(resp);
  }

  public async refreshTaskStatus(Request: Request, Response: Response) {
    const resp = await this.withValidatedInput(Request, "refreshTaskStatus", validateTokenAndGetUser, (user) =>
      this.service.refreshTaskStatus(this.toAdapterInput(Request, user))
    );
    Response.status(resp.code).send(resp);
  }

  public async cleanupTasks(Request: Request, Response: Response) {
    const resp = await this.withValidatedInput(Request, "cleanupTasks", validateTokenAndGetSuperAdminUser, () =>
      this.service.cleanupTasks()
    );
    Response.status(resp.code).send(resp);
  }

  public async getUserLatestTaskStatus(Request: Request, Response: Response) {
    const resp = await this.withValidatedInput(Request, "getUserLatestTaskStatus", validateTokenAndGetUser, (user) =>
      this.service.getUserLatestTaskStatus(this.toAdapterInput(Request, user))
    );
    Response.status(resp.code).send(resp);
  }

  public async getDatacenterStatus(Request: Request, Response: Response) {
    const resp = await this.withValidatedInput(Request, "getDatacenterStatus", validateTokenAndGetSuperAdminUser, () =>
      this.service.getDatacenterStatus()
    );
    Response.status(resp.code).send(resp);
  }

  private async handleQemuConfig(Request: Request): Promise<resp<PVEResp | undefined>> {
    try {
      const token_role = (await getTokenRole(Request)).role;
      if (!this.isQemuConfigRole(token_role)) {
        return createResponse(403, "Invalid role");
      }

      const { user, error } = await this.validateQemuConfigUser(Request, token_role);
      if (error) {
        logger.error("Error validating token:", error);
        return error;
      }

      return this.service.getQemuConfig({
        role: token_role,
        ...this.toAdapterInput(Request, user)
      });
    } catch (error) {
      logger.error("Error in getQemuConfig:", error);
      return createResponse(500, "Internal Server Error");
    }
  }

  private async withValidatedInput<T>(
    Request: Request,
    operation: string,
    validator: (request: Request) => Promise<{ user: User; error?: resp<any> }>,
    action: (user: User) => Promise<resp<T | undefined>>
  ): Promise<resp<T | undefined>> {
    try {
      const { user, error } = await validator(Request);
      if (error) {
        logger.error("Error validating token:", error);
        return error;
      }

      return action(user);
    } catch (error) {
      logger.error(`Error in ${operation}:`, error);
      return createResponse(500, "Internal Server Error");
    }
  }

  private toAdapterInput(Request: Request, user: User) {
    return {
      user,
      body: Request.body,
      query: Request.query
    };
  }

  private isQemuConfigRole(role: unknown): role is PVEQemuConfigRole {
    return role === "user" || role === "admin" || role === "superadmin";
  }

  private async validateQemuConfigUser(
    Request: Request,
    role: PVEQemuConfigRole
  ): Promise<{ user: User; error?: undefined } | { user?: undefined; error: resp<PVEResp | undefined> }> {
    if (role === "user") {
      return validateTokenAndGetUser<PVEResp>(Request);
    }

    if (role === "admin") {
      return validateTokenAndGetAdminUser<PVEResp>(Request);
    }

    return validateTokenAndGetSuperAdminUser<PVEResp>(Request);
  }
}
