import { Controller } from "../abstract/Controller";
import { Request, Response } from "express";
import { AIBoxBuildService } from "../service/AIBoxBuildService";

export class AIBoxBuildController extends Controller {
    protected service: AIBoxBuildService;

    constructor() {
        super();
        this.service = new AIBoxBuildService();
    }

    public async createJob(Request: Request, Response: Response) {
        const resp = await this.service.createJob(Request);
        Response.status(resp.code).send(resp);
    }

    public async listJobs(Request: Request, Response: Response) {
        const resp = await this.service.listJobs(Request);
        Response.status(resp.code).send(resp);
    }

    public async getJob(Request: Request, Response: Response) {
        const resp = await this.service.getJob(Request);
        Response.status(resp.code).send(resp);
    }

    public async deleteJob(Request: Request, Response: Response) {
        const resp = await this.service.deleteJob(Request);
        Response.status(resp.code).send(resp);
    }

    public async addMessage(Request: Request, Response: Response) {
        const resp = await this.service.addMessage(Request);
        Response.status(resp.code).send(resp);
    }

    public async updateStatus(Request: Request, Response: Response) {
        const resp = await this.service.updateStatus(Request);
        Response.status(resp.code).send(resp);
    }

    public async launchBuildRun(Request: Request, Response: Response) {
        const resp = await this.service.launchBuildRun(Request);
        Response.status(resp.code).send(resp);
    }
}
