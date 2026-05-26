import { Request } from "express";
import { Service } from "../abstract/Service";
import {
    AIBoxBuildJobDTO,
} from "../interfaces/AIBoxBuildJob";
import { logger } from "../middlewares/log";
import { validateTokenAndGetAdminUser } from "../utils/auth";
import { resp, createResponse } from "../utils/resp";
import { AIBoxBuildJobManagementService } from "../modules/ai-box-build/AIBoxBuildJobManagementService";
import { aiBoxBuildDraftService } from "../modules/ai-box-build/AIBoxBuildDraftService";
import { AIBoxBuildRunExecutionService } from "../modules/ai-box-build/AIBoxBuildRunExecutionService";
import { AIBoxBuildRunLaunchService } from "../modules/ai-box-build/AIBoxBuildRunLaunchService";
import {
    AIBoxBuildDeleteJobResponse,
    AIBoxBuildRequestAdapterService
} from "../modules/ai-box-build/AIBoxBuildRequestAdapterService";
import { User } from "../interfaces/User";

type AIBoxBuildServiceAdapterInput = {
    user: User;
    params: Request["params"];
    body: any;
    authorizationHeader: string;
};

export class AIBoxBuildService extends Service {
    private static runningJobs = new Set<string>();
    private readonly jobManagementService = new AIBoxBuildJobManagementService({
        runningJobs: AIBoxBuildService.runningJobs
    });
    private readonly runExecutionService = new AIBoxBuildRunExecutionService();
    private readonly runLaunchService = new AIBoxBuildRunLaunchService({
        runningJobs: AIBoxBuildService.runningJobs,
        runExecution: this.runExecutionService
    });
    private readonly requestAdapter = new AIBoxBuildRequestAdapterService({
        draft: aiBoxBuildDraftService,
        jobManagement: this.jobManagementService,
        runLaunch: this.runLaunchService
    });

    public async createJob(Request: Request): Promise<resp<AIBoxBuildJobDTO | undefined>> {
        return this.withAdminInput(Request, "creating AI box build job", (input) => this.requestAdapter.createJob(input));
    }

    public async listJobs(Request: Request): Promise<resp<AIBoxBuildJobDTO[] | undefined>> {
        return this.withAdminInput(Request, "listing AI box build jobs", (input) => this.requestAdapter.listJobs(input));
    }

    public async getJob(Request: Request): Promise<resp<AIBoxBuildJobDTO | undefined>> {
        return this.withAdminInput(Request, "fetching AI box build job", (input) => this.requestAdapter.getJob(input));
    }

    public async deleteJob(Request: Request): Promise<resp<AIBoxBuildDeleteJobResponse | undefined>> {
        return this.withAdminInput(
            Request,
            "deleting AI box build job",
            (input) => this.requestAdapter.deleteJob(input),
            (error) => error instanceof Error ? error.message : "Internal Server Error"
        );
    }

    public async addMessage(Request: Request): Promise<resp<AIBoxBuildJobDTO | undefined>> {
        return this.withAdminInput(Request, "updating AI box build job", (input) => this.requestAdapter.addMessage(input));
    }

    public async updateStatus(Request: Request): Promise<resp<AIBoxBuildJobDTO | undefined>> {
        return this.withAdminInput(Request, "updating AI box build job status", (input) => this.requestAdapter.updateStatus(input));
    }

    public async launchBuildRun(Request: Request): Promise<resp<AIBoxBuildJobDTO | undefined>> {
        return this.withAdminInput(Request, "launching AI box build run", (input) => this.requestAdapter.launchBuildRun(input));
    }

    private async withAdminInput<T>(
        Request: Request,
        actionName: string,
        action: (input: AIBoxBuildServiceAdapterInput) => Promise<resp<T | undefined>>,
        errorMessage: (error: unknown) => string = () => "Internal Server Error"
    ): Promise<resp<T | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<T>(Request);
            if (error) return error;

            return action(this.toAdapterInput(Request, user));
        } catch (error) {
            logger.error(`Error ${actionName}:`, error);
            return createResponse(500, errorMessage(error));
        }
    }

    private toAdapterInput(Request: Request, user: User): AIBoxBuildServiceAdapterInput {
        return {
            user,
            params: Request.params,
            body: Request.body,
            authorizationHeader: Request.headers.authorization || ""
        };
    }
}
