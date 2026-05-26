import { Controller } from "../abstract/Controller";
import { Request, Response } from "express";
import { User } from "../interfaces/User";
import { logger } from "../middlewares/log";
import { AIBoxBuildService } from "../service/AIBoxBuildService";
import { validateTokenAndGetAdminUser } from "../utils/auth";
import { createResponse, resp } from "../utils/resp";

export class AIBoxBuildController extends Controller {
    protected service: AIBoxBuildService;

    constructor() {
        super();
        this.service = new AIBoxBuildService();
    }

    public async createJob(Request: Request, Response: Response) {
        const resp = await this.withAdminInput(Request, "creating AI box build job", (input) => this.service.createJob(input));
        Response.status(resp.code).send(resp);
    }

    public async listJobs(Request: Request, Response: Response) {
        const resp = await this.withAdminInput(Request, "listing AI box build jobs", (input) => this.service.listJobs(input));
        Response.status(resp.code).send(resp);
    }

    public async getJob(Request: Request, Response: Response) {
        const resp = await this.withAdminInput(Request, "fetching AI box build job", (input) => this.service.getJob(input));
        Response.status(resp.code).send(resp);
    }

    public async deleteJob(Request: Request, Response: Response) {
        const resp = await this.withAdminInput(
            Request,
            "deleting AI box build job",
            (input) => this.service.deleteJob(input),
            (error) => error instanceof Error ? error.message : "Internal Server Error"
        );
        Response.status(resp.code).send(resp);
    }

    public async addMessage(Request: Request, Response: Response) {
        const resp = await this.withAdminInput(Request, "updating AI box build job", (input) => this.service.addMessage(input));
        Response.status(resp.code).send(resp);
    }

    public async updateStatus(Request: Request, Response: Response) {
        const resp = await this.withAdminInput(Request, "updating AI box build job status", (input) => this.service.updateStatus(input));
        Response.status(resp.code).send(resp);
    }

    public async launchBuildRun(Request: Request, Response: Response) {
        const resp = await this.withAdminInput(Request, "launching AI box build run", (input) => this.service.launchBuildRun(input));
        Response.status(resp.code).send(resp);
    }

    private async withAdminInput<T>(
        Request: Request,
        actionName: string,
        action: (input: { user: User; params: Record<string, unknown>; body: any; authorizationHeader: string }) => Promise<resp<T | undefined>>,
        errorMessage: (error: unknown) => string = () => "Internal Server Error"
    ): Promise<resp<T | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<T>(Request);
            if (error) return error;

            return action({
                user,
                params: Request.params,
                body: Request.body,
                authorizationHeader: Request.headers.authorization || ""
            });
        } catch (error) {
            logger.error(`Error ${actionName}:`, error);
            return createResponse(500, errorMessage(error));
        }
    }
}
