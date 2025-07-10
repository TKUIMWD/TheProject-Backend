import { Controller } from "../abstract/Controller";
import { Request, Response } from "express";
import { logger } from "../middlewares/log";
import { Service } from "../abstract/Service";
import { CourseService } from "../service/CourseService";
import { resp } from "../utils/resp";
import { Course } from "../interfaces/Course";
require('dotenv').config()

export class CourseController extends Controller {
  protected service: CourseService;

  constructor() {
    super();
    this.service = new CourseService();
  }

  public async getClassById(Request: Request, Response: Response) {
    const resp = await this.service.getClassById(Request);
    Response.status(resp.code).send(resp);
  }

  public async getCoursePageDTO(Request: Request, Response: Response) {
    const resp = await this.service.getCoursePageDTO(Request);
    Response.status(resp.code).send(resp);
  }
}