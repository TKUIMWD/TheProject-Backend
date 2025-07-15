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

  public async test(Request: Request, Response: Response) {
    const resp = await this.service.test(Request);
    Response.status(resp.code).send(resp);
  }

  public async getNodes(Request: Request, Response: Response) {
    const resp = await this.service.getNodes(Request)
    Response.status(resp.code).send(resp)
  }

  public async getQemuConfig(Request: Request, Response: Response) {
    const resp = await this.service.getQemuConfig(Request);
    Response.status(resp.code).send(resp);
  }

  public async getAllTemplates(Request: Request, Response: Response) {
    const resp = await this.service.getAllTemplates(Request);
    Response.status(resp.code).send(resp);
  }

  public async getAllApprovedTemplates(Request: Request, Response: Response) {
    const resp = await this.service.getAllApprovedTemplates(Request);
    Response.status(resp.code).send(resp);
  }

  public async createVMFromTemplate(Request: Request, Response: Response) {
    const resp = await this.service.createVMFromTemplate(Request);
    Response.status(resp.code).send(resp);
  }

  public async getMultipleTasksStatus(Request: Request, Response: Response) {
    const resp = await this.service.getMultipleTasksStatus(Request);
    Response.status(resp.code).send(resp);
  }

  public async getUserAllTasksStatus(Request: Request, Response: Response) {
    const resp = await this.service.getUserAllTasksStatus(Request);
    Response.status(resp.code).send(resp);
  }

  public async refreshTaskStatus(Request: Request, Response: Response) {
    const resp = await this.service.refreshTaskStatus(Request);
    Response.status(resp.code).send(resp);
  }

  public async cleanupTasks(Request: Request, Response: Response) {
    const resp = await this.service.cleanupTasks(Request);
    Response.status(resp.code).send(resp);
  }

  public async deleteUserVM(Request: Request, Response: Response) {
    const resp = await this.service.deleteUserVM(Request);
    Response.status(resp.code).send(resp);
  }
}