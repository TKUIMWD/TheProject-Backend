import { Request, Response } from "express";
import { Controller } from "../abstract/Controller";
import { SuperAdminCRPService } from "../service/SuperAdminCRPService";



export class SuperAdminCRPController extends Controller {
    
    protected service: SuperAdminCRPService;

    constructor() {
        super();
        this.service = new SuperAdminCRPService();
    }

    public createCRP = async (Request: Request, Response: Response) => {
        const resp = await this.service.createCRP(Request);
        Response.status(resp.code).json(resp);
    }

    public updateCRP = async (Request: Request, Response: Response) => {
        const resp = await this.service.updateCRP(Request);
        Response.status(resp.code).json(resp);
    }

    public deleteCRP = async (Request: Request, Response: Response) => {
        const resp = await this.service.deleteCRP(Request);
        Response.status(resp.code).json(resp);
    }

    public getAllCRPs = async (Request: Request, Response: Response) => {
        const resp = await this.service.getAllCRPs(Request);
        Response.status(resp.code).json(resp);
    }
}