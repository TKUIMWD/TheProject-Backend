import { Controller } from "../abstract/Controller";
import { Request, Response } from "express";
import Roles from "../enum/role";
import { User } from "../interfaces/User";
import { logger } from "../middlewares/log";
import { VMService } from "../service/VMService";
import { validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { createResponse, resp } from "../utils/resp";

type VMReadContext = { user: User; isSuperAdmin: boolean; error?: undefined } | { user?: undefined; isSuperAdmin?: undefined; error: resp<undefined> };

export class VMController extends Controller {
  protected service: VMService;

  constructor() {
    super();
    this.service = new VMService();
  }
  
  public async getAllVMs(Request: Request, Response: Response) {
    const resp = await this.withValidatedUser(Request, "getAllVMs", validateTokenAndGetSuperAdminUser, () => this.service.getAllVMs());
    Response.status(resp.code).send(resp);
  }

  public async getUserOwnedVMs(Request: Request, Response: Response) {
    const resp = await this.withValidatedUser(Request, "getUserOwnedVMs", validateTokenAndGetUser, (user) => this.service.getUserOwnedVMs(user));
    Response.status(resp.code).send(resp);
  }

  public async getVMStatus(Request: Request, Response: Response) {
    const resp = await this.withVMReadContext(Request, "getVMStatus", "Internal server error", (context) => this.service.getVMStatus({
      user: context.user,
      isSuperAdmin: context.isSuperAdmin,
      query: Request.query
    }));
    Response.status(resp.code).send(resp);
  }

  public async getVMNetworkInfo(Request: Request, Response: Response) {
    const resp = await this.withVMReadContext(Request, "getVMNetworkInfo", "Internal server error", (context) => this.service.getVMNetworkInfo({
      user: context.user,
      isSuperAdmin: context.isSuperAdmin,
      query: Request.query
    }));
    Response.status(resp.code).send(resp);
  }

  private async withValidatedUser<T>(
    Request: Request,
    actionName: string,
    validator: <R>(request: Request) => Promise<{ user: any; error?: resp<R | undefined> }>,
    action: (user: User) => Promise<resp<T | undefined>>
  ): Promise<resp<T | undefined>> {
    try {
      const { user, error } = await validator<T>(Request);
      if (error) {
        logger.error("Error validating token:", error);
        return createResponse(error.code, error.message);
      }

      return action(user);
    } catch (error) {
      logger.error(`Error in ${actionName}:`, error);
      return createResponse(500, "Internal Server Error");
    }
  }

  private async withVMReadContext<T>(
    Request: Request,
    actionName: string,
    errorMessage: string,
    action: (context: { user: User; isSuperAdmin: boolean }) => Promise<resp<T | undefined>>
  ): Promise<resp<T | undefined>> {
    try {
      const context = await this.getVMReadContext(Request);
      if (context.error) return context.error;

      return action(context);
    } catch (error) {
      logger.error(`Error in ${actionName}:`, error);
      return createResponse(500, errorMessage);
    }
  }

  private async getVMReadContext(Request: Request): Promise<VMReadContext> {
    const { user: superAdminUser, error: superAdminError } = await validateTokenAndGetSuperAdminUser<User>(Request);
    if (!superAdminError && superAdminUser && superAdminUser.role === Roles.SuperAdmin) {
      return { user: superAdminUser, isSuperAdmin: true };
    }

    const { user, error } = await validateTokenAndGetUser<User>(Request);
    if (error) {
      logger.error("Error validating token:", error);
      return { error: createResponse(error.code, error.message) };
    }

    return { user, isSuperAdmin: false };
  }
}
