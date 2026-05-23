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

  public async updateBoxAiAssistantSetting(Request: Request, Response: Response) {
    const resp = await this.service.updateBoxAiAssistantSetting(Request);
    Response.status(resp.code).send(resp);
  }

  public async getBoxReviews(Request: Request, Response: Response) {
    const resp = await this.service.getBoxReviews(Request);
    Response.status(resp.code).send(resp);
  }

  public async updateBoxReview(Request: Request, Response: Response) {
    const resp = await this.service.updateBoxReview(Request);
    Response.status(resp.code).send(resp);
  }

  public async deleteBoxReview(Request: Request, Response: Response) {
    const resp = await this.service.deleteBoxReview(Request);
    Response.status(resp.code).send(resp);
  }

  public async submitBoxWriteup(Request: Request, Response: Response) {
    const resp = await this.service.submitBoxWriteup(Request);
    Response.status(resp.code).send(resp);
  }

  public async getPublicBoxWriteups(Request: Request, Response: Response) {
    const resp = await this.service.getPublicBoxWriteups(Request);
    Response.status(resp.code).send(resp);
  }

  public async getMyBoxWriteups(Request: Request, Response: Response) {
    const resp = await this.service.getMyBoxWriteups(Request);
    Response.status(resp.code).send(resp);
  }

  public async getBoxWriteupSubmissions(Request: Request, Response: Response) {
    const resp = await this.service.getBoxWriteupSubmissions(Request);
    Response.status(resp.code).send(resp);
  }

  public async reviewBoxWriteup(Request: Request, Response: Response) {
    const resp = await this.service.reviewBoxWriteup(Request);
    Response.status(resp.code).send(resp);
  }

  public async updateBoxWriteupVisibility(Request: Request, Response: Response) {
    const resp = await this.service.updateBoxWriteupVisibility(Request);
    Response.status(resp.code).send(resp);
  }

  public async getMyAnswerRecord(Request: Request, Response: Response) {
    const resp = await this.service.getMyAnswerRecord(Request);
    Response.status(resp.code).send(resp);
  }

  public async submitBoxAnswer(Request: Request, Response: Response) {
    const resp = await this.service.submitBoxAnswer(Request);
    Response.status(resp.code).send(resp);
  }
}
