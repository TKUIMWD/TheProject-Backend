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

  public async AddCourse(Request: Request, Response: Response) {
    const resp = await this.service.AddCourse(Request);
    Response.status(resp.code).send(resp);
  }

  public async UpdateCourseById(Request: Request, Response: Response) {
    const resp = await this.service.UpdateCourseById(Request);
    Response.status(resp.code).send(resp);
  }

  public async DeleteCourseById(Request: Request, Response: Response) {
    const resp = await this.service.DeleteCourseById(Request);
    Response.status(resp.code).send(resp);
  }

  public async GetAllPulicCourses(Request: Request, Response: Response) {
    const resp = await this.service.GetAllPublicCourses(Request);
    Response.status(resp.code).send(resp);
  }

  public async JoinCourseById(Request: Request, Response: Response) {
    const resp = await this.service.JoinCourseById(Request);
    Response.status(resp.code).send(resp);
  }

  public async ApprovedCourseById(Request: Request, Response: Response) {
    const resp = await this.service.ApprovedCourseById(Request);
    Response.status(resp.code).send(resp);
  }

  public async UnApprovedCourseById(Request: Request, Response: Response) {
    const resp = await this.service.UnApprovedCourseById(Request);
    Response.status(resp.code).send(resp);
  }

  public async InviteToJoinCourse(Request: Request, Response: Response) {
    const resp = await this.service.InviteToJoinCourse(Request);
    Response.status(resp.code).send(resp);
  }
}