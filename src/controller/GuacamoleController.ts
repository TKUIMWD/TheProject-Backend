import { Controller } from "../abstract/Controller";
import { Request, Response } from "express";
import { GuacamoleService } from "../service/GuacamoleService";
require('dotenv').config()

export class GuacamoleController extends Controller {
  protected service: GuacamoleService;

  constructor() {
    super();
    this.service = new GuacamoleService();
  }

    public async establishSSHConnection(Request: Request, Response: Response) {
    const resp = await this.service.establishSSHConnection(Request);
    Response.status(resp.code).send(resp);
  }

  public async establishRDPConnection(Request: Request, Response: Response) {
    const resp = await this.service.establishRDPConnection(Request);
    Response.status(resp.code).send(resp);
  }

  public async establishVNCConnection(Request: Request, Response: Response) {
    const resp = await this.service.establishVNCConnection(Request);
    Response.status(resp.code).send(resp);
  }

  public async disconnectGuacamoleConnection(Request: Request, Response: Response) {
    const resp = await this.service.disconnectGuacamoleConnection(Request);
    Response.status(resp.code).send(resp);
  }

  public async listUserConnections(Request: Request, Response: Response) {
    const resp = await this.service.listUserConnections(Request);
    Response.status(resp.code).send(resp);
  }
}