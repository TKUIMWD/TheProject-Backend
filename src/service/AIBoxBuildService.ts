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

    public async createJob(Request: Request): Promise<resp<AIBoxBuildJobDTO | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<AIBoxBuildJobDTO>(Request);
            if (error) return error;

            return aiBoxBuildDraftService.createJob({
                user,
                request: Request.body
            });
        } catch (error) {
            logger.error("Error creating AI box build job:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async listJobs(Request: Request): Promise<resp<AIBoxBuildJobDTO[] | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<AIBoxBuildJobDTO[]>(Request);
            if (error) return error;

            return this.jobManagementService.listJobs(user);
        } catch (error) {
            logger.error("Error listing AI box build jobs:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async getJob(Request: Request): Promise<resp<AIBoxBuildJobDTO | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<AIBoxBuildJobDTO>(Request);
            if (error) return error;

            const { job_id } = Request.params;
            return this.jobManagementService.getJob({ user, jobId: job_id });
        } catch (error) {
            logger.error("Error fetching AI box build job:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async deleteJob(Request: Request): Promise<resp<{ deleted_job_id: string; workspace_path?: string; workspace_deleted: boolean } | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<{ deleted_job_id: string; workspace_path?: string; workspace_deleted: boolean }>(Request);
            if (error) return error;

            const { job_id } = Request.params;
            return this.jobManagementService.deleteJob({ user, jobId: job_id });
        } catch (error) {
            logger.error("Error deleting AI box build job:", error);
            return createResponse(500, error instanceof Error ? error.message : "Internal Server Error");
        }
    }

    public async addMessage(Request: Request): Promise<resp<AIBoxBuildJobDTO | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<AIBoxBuildJobDTO>(Request);
            if (error) return error;

            const { job_id } = Request.params;
            return aiBoxBuildDraftService.addMessage({
                user,
                jobId: job_id,
                request: Request.body
            });
        } catch (error) {
            logger.error("Error updating AI box build job:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async updateStatus(Request: Request): Promise<resp<AIBoxBuildJobDTO | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<AIBoxBuildJobDTO>(Request);
            if (error) return error;

            const { job_id } = Request.params;
            const { status } = Request.body;
            return this.jobManagementService.updateStatus({ user, jobId: job_id, status });
        } catch (error) {
            logger.error("Error updating AI box build job status:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async launchBuildRun(Request: Request): Promise<resp<AIBoxBuildJobDTO | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<AIBoxBuildJobDTO>(Request);
            if (error) return error;

            const { job_id } = Request.params;
            return this.runLaunchService.launch({
                user,
                jobId: job_id,
                body: Request.body,
                authorizationHeader: Request.headers.authorization || ""
            });
        } catch (error) {
            logger.error("Error launching AI box build run:", error);
            return createResponse(500, "Internal Server Error");
        }
    }
}
