import { Controller } from "../abstract/Controller";
import { Request, Response } from "express";
import { logger } from "../middlewares/log";
import { VMOperateService } from "../service/VMOperateService";
require('dotenv').config()

export class VMOperateController extends Controller {
  protected service: VMOperateService;

  constructor() {
    super();
    this.service = new VMOperateService();
  }
  
  public async bootVM(Request: Request, Response: Response) {
    const resp = await this.service.bootVM(Request);
    Response.status(resp.code).send(resp);
  }

  public async shutdownVM(Request: Request, Response: Response) {
    const resp = await this.service.shutdownVM(Request);
    Response.status(resp.code).send(resp);
  }

  public async poweroffVM(Request: Request, Response: Response) {
    const resp = await this.service.poweroffVM(Request);
    Response.status(resp.code).send(resp);
  }

  public async rebootVM(Request: Request, Response: Response) {
    const resp = await this.service.rebootVM(Request);
    Response.status(resp.code).send(resp);
  }

  public async resetVM(Request: Request, Response: Response) {
    const resp = await this.service.resetVM(Request);
    Response.status(resp.code).send(resp);
  }
}
