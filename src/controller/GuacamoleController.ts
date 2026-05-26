import { Controller } from "../abstract/Controller";
import { Request, Response } from "express";
import { User } from "../interfaces/User";
import { logger } from "../middlewares/log";
import { GuacamoleService } from "../service/GuacamoleService";
import { validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { createResponse, resp } from "../utils/resp";

type GuacamoleUserValidation = { user: User; isSuperAdmin: boolean } | { error: resp<undefined> };

export class GuacamoleController extends Controller {
  protected service: GuacamoleService;

  constructor() {
    super();
    this.service = new GuacamoleService();
  }

  public async establishSSHConnection(Request: Request, Response: Response) {
    const resp = await this.withGuacamoleInput(Request, "establishing SSH connection", (input) =>
      this.service.establishSSHConnection(input)
    );
    Response.status(resp.code).send(resp);
  }

  public async establishRDPConnection(Request: Request, Response: Response) {
    const resp = await this.withGuacamoleInput(Request, "establishing RDP connection", (input) =>
      this.service.establishRDPConnection(input)
    );
    Response.status(resp.code).send(resp);
  }

  public async establishVNCConnection(Request: Request, Response: Response) {
    const resp = await this.withGuacamoleInput(Request, "establishing VNC connection", (input) =>
      this.service.establishVNCConnection(input)
    );
    Response.status(resp.code).send(resp);
  }

  public async disconnectGuacamoleConnection(Request: Request, Response: Response) {
    const resp = await this.withGuacamoleInput(
      Request,
      "disconnecting Guacamole connection",
      (input) => this.service.disconnectGuacamoleConnection(input),
      (error) => `Error disconnecting connection: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    Response.status(resp.code).send(resp);
  }

  public async listUserConnections(Request: Request, Response: Response) {
    const resp = await this.withGuacamoleInput(Request, "listing user connections", (input) =>
      this.service.listUserConnections(input)
    );
    Response.status(resp.code).send(resp);
  }

  public async deleteConnection(Request: Request, Response: Response) {
    const resp = await this.withGuacamoleInput(Request, "deleting connection", (input) =>
      this.service.deleteConnection(input)
    );
    Response.status(resp.code).send(resp);
  }

  private async validateUserPermissions(req: Request): Promise<GuacamoleUserValidation> {
    try {
      const { user: superUser, error: superError } = await validateTokenAndGetSuperAdminUser<User>(req);
      if (!superError && superUser && superUser._id) {
        return { user: superUser, isSuperAdmin: true };
      }

      const { user, error: userError } = await validateTokenAndGetUser<User>(req);
      if (!userError && user && user._id) {
        return { user, isSuperAdmin: false };
      }

      logger.error("Authentication failed for GuacamoleService:", userError || superError);
      return { error: createResponse(401, "Authentication failed") };

    } catch (error) {
      logger.error("Error validating user permissions:", error);
      return { error: createResponse(500, "Internal Server Error") };
    }
  }

  private async withGuacamoleInput<T>(
    req: Request,
    logContext: string,
    action: (input: { user: User; isSuperAdmin: boolean; body: any }) => Promise<resp<T | undefined>>,
    failureMessage: (error: unknown) => string = () => "Internal Server Error"
  ): Promise<resp<T | undefined>> {
    try {
      const userValidation = await this.validateUserPermissions(req);
      if ('error' in userValidation) {
        return userValidation.error;
      }

      return action({
        user: userValidation.user,
        isSuperAdmin: userValidation.isSuperAdmin,
        body: req.body
      });
    } catch (error) {
      logger.error(`Error ${logContext}:`, error);
      return createResponse(500, failureMessage(error));
    }
  }
}
