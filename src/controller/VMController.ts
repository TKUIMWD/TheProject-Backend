import { Controller } from "../abstract/Controller";
import { Request, Response } from "express";
import { logger } from "../middlewares/log";
import { VMService } from "../service/VMService";
require('dotenv').config()

export class VMController extends Controller {
  protected service: VMService;

  constructor() {
    super();
    this.service = new VMService();
  }

  public async createVMFromTemplate(Request: Request, Response: Response) {
    const resp = await this.service.createVMFromTemplate(Request);
    Response.status(resp.code).send(resp);
  }

  public async deleteUserVM(Request: Request, Response: Response) {
    const resp = await this.service.deleteUserVM(Request);
    Response.status(resp.code).send(resp);
  }

  public async getAllVMs(Request: Request, Response: Response) {
    const resp = await this.service.getAllVMs(Request);
    Response.status(resp.code).send(resp);
  }

  public async getUserOwnedVMs(Request: Request, Response: Response) {
    const resp = await this.service.getUserOwnedVMs(Request);
    Response.status(resp.code).send(resp);
  }
}
