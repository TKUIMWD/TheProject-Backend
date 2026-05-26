import { Controller } from "../abstract/Controller";
import { Request, Response } from "express";
import { resp } from "../utils/resp";
import { DBResp } from "../interfaces/Response/DBResp";
import { AuthService } from "../service/AuthService";
import { Document } from "mongoose";
import { logger } from "../middlewares/log";
import { AuthResponse } from "../interfaces/Response/AuthResponse";
import { validateTokenAndGetUser } from "../utils/auth";
import { createResponse } from "../utils/resp";

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
        const resp = await this.withAuthenticatedUser<AuthResponse>(Request, (user) => this.service.verify(user));
        Response.status(resp.code).send(resp)
    }

    public async login(Request: Request, Response: Response) {
        const resp = await this.service.login(Request.body)
        Response.status(resp.code).send(resp)
    }
    
    public async logout(Request: Request, Response: Response) {
        const resp = await this.withAuthenticatedUser<DBResp<Document>>(Request, (user) => this.service.logout(user));
        Response.status(resp.code).send(resp)
    }

    public async forgotPassword(Request: Request, Response: Response) {
        const resp = await this.service.forgotPassword({
            method: Request.method,
            body: Request.body,
            authorizationHeader: Request.headers.authorization
        })
        Response.status(resp.code).send(resp)
    }

    private async withAuthenticatedUser<T>(
        Request: Request,
        action: (user: any) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<T>(Request);
            if (error) {
                return error;
            }

            return action(user);
        } catch (error) {
            logger.error(error);
            return createResponse(500, "internal server error");
        }
    }
}
