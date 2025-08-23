import { Controller } from "../abstract/Controller";
import { Request, Response } from "express";
import { logger } from "../middlewares/log";
import { VMBoxService } from "../service/VMBoxService";

export class VMBoxController extends Controller {
  protected service: VMBoxService;

  constructor() {
    super();
    this.service = new VMBoxService();
  }

  public async submitBox(Request: Request, Response: Response) {
    const resp = await this.service.submitBox(Request);
    Response.status(resp.code).send(resp);
  }

  public async auditBoxSubmission(Request: Request, Response: Response) {
    const resp = await this.service.auditBoxSubmission(Request);
    Response.status(resp.code).send(resp);
  }

  public async getSubmittedBoxes(Request: Request, Response: Response) {
    const resp = await this.service.getSubmittedBoxes(Request);
    Response.status(resp.code).send(resp);
  }

  public async rateBox(Request: Request, Response: Response) {
    const resp = await this.service.rateBox(Request);
    Response.status(resp.code).send(resp);
  }

  public async getPublicBoxes(Request: Request, Response: Response) {
    const resp = await this.service.getPublicBoxes(Request);
    Response.status(resp.code).send(resp);
  }

  public async getPendingBoxes(Request: Request, Response: Response) {
    const resp = await this.service.getPendingBoxes(Request);
    Response.status(resp.code).send(resp);
  }

  public async getBoxReviews(Request: Request, Response: Response) {
    const resp = await this.service.getBoxReviews(Request);
    Response.status(resp.code).send(resp);
  }
}
