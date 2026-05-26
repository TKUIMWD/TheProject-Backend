import { Controller } from "../abstract/Controller";
import { Request, Response } from "express";
import { logger } from "../middlewares/log";
import { VMOperateService } from "../service/VMOperateService";
import { User } from "../interfaces/User";
import { VMOperation } from "../modules/vm/VMOperationPolicy";
import { validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { createResponse, resp } from "../utils/resp";

export class VMOperateController extends Controller {
  protected service: VMOperateService;

  constructor() {
    super();
    this.service = new VMOperateService();
  }
  
  public async bootVM(Request: Request, Response: Response) {
    const resp = await this.executeVMOperation(Request, "boot");
    Response.status(resp.code).send(resp);
  }

  public async shutdownVM(Request: Request, Response: Response) {
    const resp = await this.executeVMOperation(Request, "shutdown");
    Response.status(resp.code).send(resp);
  }

  public async poweroffVM(Request: Request, Response: Response) {
    const resp = await this.executeVMOperation(Request, "poweroff");
    Response.status(resp.code).send(resp);
  }

  public async rebootVM(Request: Request, Response: Response) {
    const resp = await this.executeVMOperation(Request, "reboot");
    Response.status(resp.code).send(resp);
  }

  public async resetVM(Request: Request, Response: Response) {
    const resp = await this.executeVMOperation(Request, "reset");
    Response.status(resp.code).send(resp);
  }

  private async executeVMOperation(request: Request, operation: VMOperation): Promise<resp<any>> {
    try {
      const { user, error } = await validateTokenAndGetUser<User>(request);
      if (error) {
        logger.warn(`Token validation failed in ${operation}VM: ${error.message}`);
        return createResponse(error.code, error.message);
      }

      const isSuperAdmin = await this.isSuperAdmin(request);
      return this.service.executeVMOperation({
        user,
        isSuperAdmin,
        vmId: request.body.vm_id,
        operation
      });
    } catch (error) {
      logger.error(`Error in ${operation}VM:`, error);
      return createResponse(500, "Internal server error");
    }
  }

  private async isSuperAdmin(request: Request): Promise<boolean> {
    const { user, error } = await validateTokenAndGetSuperAdminUser<User>(request);
    return !error && Boolean(user);
  }
}
