import { Controller } from "../abstract/Controller";
import { Request, Response } from "express";
import { ChapterService } from "../service/ChapterService";
require('dotenv').config()

export class ChapterController extends Controller {
  protected service: ChapterService;

  constructor() {
    super();
    this.service = new ChapterService();
  }

  public async getChapterById(Request: Request, Response: Response) {
    const resp = await this.service.getChapterById(Request);
    Response.status(resp.code).send(resp);
  }

  public async AddChapterToClass(Request: Request, Response: Response) {
    const resp = await this.service.AddChapterToClass(Request);
    Response.status(resp.code).send(resp);
  }
}