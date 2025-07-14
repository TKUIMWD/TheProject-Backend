import { Controller } from "../abstract/Controller";
import { Request, response, Response } from "express";
import { resp } from "../utils/resp";
import { DBResp } from "../interfaces/Response/DBResp";
import { AuthService } from "../service/AuthService";
require('dotenv').config()

export class AuthController extends Controller {
    protected service: AuthService;

    constructor() {
        super();
        this.service = new AuthService();
    }

    public async register(Request: Request, Response: Response) {
        const resp = await this.service.register(Request.body)
        Response.status(resp.code).send(resp)
    }

    public async verify(Request: Request, Response: Response) {
        const resp = await this.service.verify(Request);
        Response.status(resp.code).send(resp)
    }

    public async login(Request: Request, Response: Response) {
        const resp = await this.service.login(Request.body)
        Response.status(resp.code).send(resp)
    }
    
    public async logout(Request: Request, Response: Response) {
        const resp = await this.service.logout(Request)
        Response.status(resp.code).send(resp)
    }

    public async forgotPassword(Request: Request, Response: Response) {
        const resp = await this.service.forgotPassword(Request)
        Response.status(resp.code).send(resp)
    }
}