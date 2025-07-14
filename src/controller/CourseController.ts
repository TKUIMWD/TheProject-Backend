import { Controller } from "../abstract/Controller";
import { Request, Response } from "express";
import { CourseService } from "../service/CourseService";
require('dotenv').config()

export class CourseController extends Controller {
  protected service: CourseService;

  constructor() {
    super();
    this.service = new CourseService();
  }

  public async getCourseById(Request: Request, Response: Response) {
    const resp = await this.service.getCourseById(Request);
    Response.status(resp.code).send(resp);
  }

  public async getCourseMenu(Request: Request, Response: Response) {
    const resp = await this.service.getCourseMenu(Request);
    Response.status(resp.code).send(resp);
  }
}