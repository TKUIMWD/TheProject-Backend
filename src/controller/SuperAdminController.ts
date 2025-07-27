import { Request, Response } from "express";
import { Controller } from "../abstract/Controller";
import { SuperAdminService } from "../service/SuperAdminService";

export class SuperAdminController extends Controller {
    protected service: SuperAdminService;

    constructor() {
        super();
        this.service = new SuperAdminService();
    }

    public changeUserRole = async (Request: Request, Response: Response) => {
        const resp = await this.service.changeUserRole(Request);
        Response.status(resp.code).send(resp);
    }

    public assignCRPToUser = async (Request: Request, Response: Response) => {
        const resp = await this.service.assignCRPToUser(Request);
        Response.status(resp.code).send(resp);
    }
}