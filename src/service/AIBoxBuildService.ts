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
        return this.withAdminUser(Request, "creating AI box build job", (user) => this.requestAdapter.createJob({
            user,
            body: Request.body
        }));
    }

    public async listJobs(Request: Request): Promise<resp<AIBoxBuildJobDTO[] | undefined>> {
        return this.withAdminUser(Request, "listing AI box build jobs", (user) => this.requestAdapter.listJobs({ user }));
    }

    public async getJob(Request: Request): Promise<resp<AIBoxBuildJobDTO | undefined>> {
        return this.withAdminUser(Request, "fetching AI box build job", (user) => this.requestAdapter.getJob({
            user,
            params: Request.params
        }));
    }

    public async deleteJob(Request: Request): Promise<resp<AIBoxBuildDeleteJobResponse | undefined>> {
        return this.withAdminUser(Request, "deleting AI box build job", (user) => this.requestAdapter.deleteJob({
            user,
            params: Request.params
        }), (error) => error instanceof Error ? error.message : "Internal Server Error");
    }

    public async addMessage(Request: Request): Promise<resp<AIBoxBuildJobDTO | undefined>> {
        return this.withAdminUser(Request, "updating AI box build job", (user) => this.requestAdapter.addMessage({
            user,
            params: Request.params,
            body: Request.body
        }));
    }

    public async updateStatus(Request: Request): Promise<resp<AIBoxBuildJobDTO | undefined>> {
        return this.withAdminUser(Request, "updating AI box build job status", (user) => this.requestAdapter.updateStatus({
            user,
            params: Request.params,
            body: Request.body
        }));
    }

    public async launchBuildRun(Request: Request): Promise<resp<AIBoxBuildJobDTO | undefined>> {
        return this.withAdminUser(Request, "launching AI box build run", (user) => this.requestAdapter.launchBuildRun({
            user,
            params: Request.params,
            body: Request.body,
            authorizationHeader: Request.headers.authorization || ""
        }));
    }

    private async withAdminUser<T>(
        Request: Request,
        actionName: string,
        action: (user: User) => Promise<resp<T | undefined>>,
        errorMessage: (error: unknown) => string = () => "Internal Server Error"
    ): Promise<resp<T | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<T>(Request);
            if (error) return error;

            return action(user);
        } catch (error) {
            logger.error(`Error ${actionName}:`, error);
            return createResponse(500, errorMessage(error));
        }
    }
}
