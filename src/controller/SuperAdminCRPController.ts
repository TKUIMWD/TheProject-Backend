import { Request, Response } from "express";
import { Controller } from "../abstract/Controller";
import { SuperAdminCRPService } from "../service/SuperAdminCRPService";



export class SuperAdminCRPController extends Controller {

    protected service: SuperAdminCRPService;

    constructor() {
        super();
        this.service = new SuperAdminCRPService();
    }

    public async createCRP(Request: Request, Response: Response) {
        const resp = await this.service.createCRP(Request);
        Response.status(resp.code).send(resp);
    }

    public async updateCRP(Request: Request, Response: Response) {
        const resp = await this.service.updateCRP(Request);
        Response.status(resp.code).send(resp);
    }

    public async deleteCRP(Request: Request, Response: Response) {
        const resp = await this.service.deleteCRP(Request);
        Response.status(resp.code).send(resp);
    }

    public async getAllCRPs(Request: Request, Response: Response) {
        const resp = await this.service.getAllCRPs(Request);
        Response.status(resp.code).send(resp);
    }

    public async getCRPById(Request: Request, Response: Response) {
        const resp = await this.service.getCRPById(Request);
        Response.status(resp.code).send(resp);
    }
}