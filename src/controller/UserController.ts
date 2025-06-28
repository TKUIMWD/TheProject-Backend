import { Controller } from "../abstract/Controller";
import { Request, response, Response } from "express";
import { UserService } from "../service/UserService";
import { resp } from "../utils/resp";
import { DBResp } from "../interfaces/DBResp";
import { upload, handleMulterError } from "../utils/avatarUpload";
require('dotenv').config()

export class UserController extends Controller {
    protected service: UserService;

    constructor() {
        super();
        this.service = new UserService();
    }

    public async getProfile(Request: Request, Response: Response) {
        const resp = await this.service.getProfile(Request);
        Response.status(resp.code).send(resp)
    }

    public async updateProfile(Request: Request, Response: Response) {
        const resp = await this.service.updateProfile(Request);
        Response.status(resp.code).send(resp)
    }

    public async changePassword(Request: Request, Response: Response) {
        const resp = await this.service.changePassword(Request);
        Response.status(resp.code).send(resp)
    }

    public async uploadAvatar(Request: Request, Response: Response) {
        const resp = await this.service.uploadAvatar(Request);
        Response.status(resp.code).send(resp);
    }

    public async deleteAvatar(Request: Request, Response: Response) {
        const resp = await this.service.deleteAvatar(Request);
        Response.status(resp.code).send(resp);
    }
}