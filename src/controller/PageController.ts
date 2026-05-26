import { Controller } from "../abstract/Controller";
import {Request, Response} from "express";
import { logger } from "../middlewares/log";
import { Service } from "../abstract/Service";
import { PageService } from "../service/PageService";
import { env } from "../config/env";

export class PageController extends Controller {
  protected service: Service;

  constructor(){
    super();
    this.service = new PageService();
  }
  
  public sendPage(Request:Request, Response:Response){
    Response.sendFile(env.server.homePagePath)
  }
}
