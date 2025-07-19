import { Controller } from "../abstract/Controller";
import { Request, Response } from "express";
import { VMManageService } from "../service/VMManageService";
require('dotenv').config()

export class VMManageController extends Controller {
    protected service: VMManageService;

    constructor() {
        super();
        this.service = new VMManageService();
    }

    public async createVMFromTemplate(Request: Request, Response: Response) {
        const resp = await this.service.createVMFromTemplate(Request);
        Response.status(resp.code).send(resp);
    }

    public async deleteUserVM(Request: Request, Response: Response) {
        const resp = await this.service.deleteUserVM(Request);
        Response.status(resp.code).send(resp);
    }

    public async updateVMConfig(Request: Request, Response: Response) {
        const resp = await this.service.updateVMConfig(Request);
        Response.status(resp.code).send(resp);
    }
}