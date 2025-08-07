import { Controller } from "../abstract/Controller";
import { Request, Response } from "express";
import { ClassService } from "../service/ClassService";
require('dotenv').config()

export class ClassController extends Controller {
  protected service: ClassService;

  constructor() {
    super();
    this.service = new ClassService();
  }

  public async getClassById(Request: Request, Response: Response) {
    const resp = await this.service.getClassById(Request);
    Response.status(resp.code).send(resp);
  }

  public async AddClassToCourse(Request: Request, Response: Response) {
    const resp = await this.service.AddClassToCourse(Request);
    Response.status(resp.code).send(resp);
  }

  public async UpdateClassById(Request: Request, Response: Response) {
    const resp = await this.service.UpdateClassById(Request);
    Response.status(resp.code).send(resp);
  }

  public async DeleteClassById(Request: Request, Response: Response) {
    const resp = await this.service.DeleteClassById(Request);
    Response.status(resp.code).send(resp);
  }
}