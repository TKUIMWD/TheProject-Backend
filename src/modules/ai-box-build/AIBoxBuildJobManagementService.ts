import Roles from "../../enum/role";
import {
    AIBoxBuildExecutionStatus,
    AIBoxBuildJobDTO,
    AIBoxBuildJobStatus
} from "../../interfaces/AIBoxBuildJob";
import { User } from "../../interfaces/User";
import { logger } from "../../middlewares/log";
import { env } from "../../config/env";
import { validateObjectIdInput } from "../common/ObjectIdPolicy";
import { createResponse, resp } from "../../utils/resp";
import { buildAIBoxBuildJobDTO } from "./AIBoxBuildDTOFactory";
import { aiBoxBuildJobRepository } from "./AIBoxBuildJobRepository";
import { aiBoxBuildWorkspaceService } from "./AIBoxBuildWorkspaceService";
import {
    ACTIVE_AI_BOX_BUILD_EXECUTION_STATUSES,
    canAccessAIBoxBuildJob,
    canDeleteAIBoxBuildJob,
    validateAIBoxBuildStatusUpdate
} from "./AIBoxBuildJobPolicy";
import {
    buildAIBoxBuildStaleRunMessage,
    selectStaleAIBoxBuildJobIds
} from "./AIBoxBuildStaleJobPolicy";
import { buildAIBoxRunLogPushUpdate } from "./AIBoxBuildRunLogPolicy";

type AIBoxBuildJobRepositoryPort = {
    listRecentJobs(query: unknown, limit?: number): Promise<any[]>;
    findById(jobId: string): Promise<any | null>;
    deleteById(jobId: string): Promise<unknown>;
    findLimited(query: unknown, limit: number): Promise<any[]>;
    updateMany(query: unknown, update: unknown): Promise<unknown>;
};

type AIBoxBuildWorkspaceServicePort = {
    deleteJobWorkspace(jobId: string, workspacePath: string): Promise<unknown>;
};

type AIBoxBuildJobManagementServiceDeps = {
    jobRepo?: AIBoxBuildJobRepositoryPort;
    workspaceService?: AIBoxBuildWorkspaceServicePort;
    runningJobs?: Set<string>;
    now?: () => Date;
    staleAfterMs?: number;
};

export class AIBoxBuildJobManagementService {
    private readonly jobRepo: AIBoxBuildJobRepositoryPort;
    private readonly workspaceService: AIBoxBuildWorkspaceServicePort;
    private readonly runningJobs: Set<string>;
    private readonly now: () => Date;
    private readonly staleAfterMs: number;

    constructor(deps: AIBoxBuildJobManagementServiceDeps = {}) {
        this.jobRepo = deps.jobRepo ?? aiBoxBuildJobRepository;
        this.workspaceService = deps.workspaceService ?? aiBoxBuildWorkspaceService;
        this.runningJobs = deps.runningJobs ?? new Set<string>();
        this.now = deps.now ?? (() => new Date());
        this.staleAfterMs = deps.staleAfterMs ?? env.opencode.staleAfterMs;
    }

    public async listJobs(user: User): Promise<resp<AIBoxBuildJobDTO[] | undefined>> {
        await this.markStaleExecutionJobs();
        const query = user.role === Roles.SuperAdmin ? {} : { requester_user_id: user._id?.toString() };
        const jobs = await this.jobRepo.listRecentJobs(query, 50);
        return createResponse(200, "AI box build jobs fetched", jobs.map(job => buildAIBoxBuildJobDTO(job)));
    }

    public async getJob(input: {
        user: User;
        jobId: unknown;
    }): Promise<resp<AIBoxBuildJobDTO | undefined>> {
        const jobIdResult = validateObjectIdInput(input.jobId, "job_id");
        if (!jobIdResult.valid) return createResponse(400, jobIdResult.message);
        const normalizedJobId = jobIdResult.value;

        await this.markStaleExecutionJobs(normalizedJobId);
        const job = await this.jobRepo.findById(normalizedJobId);
        if (!job) return createResponse(404, "AI box build job not found");
        if (!canAccessAIBoxBuildJob(input.user.role, input.user._id?.toString(), job.requester_user_id)) {
            return createResponse(403, "You do not have permission to access this job");
        }

        return createResponse(200, "AI box build job fetched", buildAIBoxBuildJobDTO(job));
    }

    public async deleteJob(input: {
        user: User;
        jobId: unknown;
    }): Promise<resp<{ deleted_job_id: string; workspace_path?: string; workspace_deleted: boolean } | undefined>> {
        const jobIdResult = validateObjectIdInput(input.jobId, "job_id");
        if (!jobIdResult.valid) return createResponse(400, jobIdResult.message);
        const normalizedJobId = jobIdResult.value;

        const job = await this.jobRepo.findById(normalizedJobId);
        if (!job) return createResponse(404, "AI box build job not found");
        if (!canAccessAIBoxBuildJob(input.user.role, input.user._id?.toString(), job.requester_user_id)) {
            return createResponse(403, "You do not have permission to delete this job");
        }

        const deletionState = canDeleteAIBoxBuildJob(normalizedJobId, job.execution_status, this.runningJobs);
        if (!deletionState.allowed) return createResponse(409, deletionState.message);

        const workspacePath = typeof job.workspace_path === 'string' ? job.workspace_path.trim() : "";
        let workspaceDeleted = false;
        if (workspacePath) {
            await this.workspaceService.deleteJobWorkspace(normalizedJobId, workspacePath);
            workspaceDeleted = true;
        }

        await this.jobRepo.deleteById(normalizedJobId);
        logger.info(`AI box build job ${normalizedJobId} deleted by ${input.user.email}; workspace_deleted=${workspaceDeleted}`);

        return createResponse(200, "AI box build job deleted", {
            deleted_job_id: normalizedJobId,
            workspace_path: workspacePath || undefined,
            workspace_deleted: workspaceDeleted
        });
    }

    public async updateStatus(input: {
        user: User;
        jobId: unknown;
        status: unknown;
    }): Promise<resp<AIBoxBuildJobDTO | undefined>> {
        const jobIdResult = validateObjectIdInput(input.jobId, "job_id");
        if (!jobIdResult.valid) return createResponse(400, jobIdResult.message);
        const normalizedJobId = jobIdResult.value;

        const statusPolicy = validateAIBoxBuildStatusUpdate({ status: input.status });
        if (!statusPolicy.valid) return createResponse(400, statusPolicy.message);

        const job = await this.jobRepo.findById(normalizedJobId);
        if (!job) return createResponse(404, "AI box build job not found");
        if (!canAccessAIBoxBuildJob(input.user.role, input.user._id?.toString(), job.requester_user_id)) {
            return createResponse(403, "You do not have permission to update this job");
        }
        if (statusPolicy.status === AIBoxBuildJobStatus.approved && job.validation_report?.status === 'blocked') {
            return createResponse(400, "Resolve blocking AI build validation findings before approval");
        }

        job.status = statusPolicy.status;
        await job.save();
        return createResponse(200, "AI box build job status updated", buildAIBoxBuildJobDTO(job));
    }

    private async markStaleExecutionJobs(jobId?: string): Promise<void> {
        const cutoff = new Date(this.now().getTime() - this.staleAfterMs);
        const query: any = {
            execution_status: { $in: ACTIVE_AI_BOX_BUILD_EXECUTION_STATUSES }
        };
        if (jobId) query._id = jobId;

        const jobs = await this.jobRepo.findLimited(query, jobId ? 1 : 25);
        const staleIds = selectStaleAIBoxBuildJobIds(jobs, cutoff, this.runningJobs);

        if (staleIds.length === 0) return;

        const message = buildAIBoxBuildStaleRunMessage(this.staleAfterMs);
        await this.jobRepo.updateMany(
            { _id: { $in: staleIds } },
            {
                $set: {
                    execution_status: AIBoxBuildExecutionStatus.failed,
                    status: AIBoxBuildJobStatus.failed,
                    error_message: message,
                    updated_at: this.now()
                },
                ...buildAIBoxRunLogPushUpdate("run", "error", message)
            }
        );
    }
}
