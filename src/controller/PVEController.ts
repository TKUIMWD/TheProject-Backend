import { Controller } from "../abstract/Controller";
import { Request, Response } from "express";
import { logger } from "../middlewares/log";
import { Service } from "../abstract/Service";
import { PVEService } from "../service/PVEService";
require('dotenv').config()

export class PVEController extends Controller {
  protected service: PVEService;

  constructor() {
    super();
    this.service = new PVEService();
  }

  public async getNodes(Request: Request, Response: Response) {
    const resp = await this.service.getNodes(Request)
    Response.status(resp.code).send(resp)
  }
  public async getNextId(Request: Request, Response: Response) {
    const resp = await this.service.getNextId(Request);
    Response.status(resp.code).send(resp);
  }
}