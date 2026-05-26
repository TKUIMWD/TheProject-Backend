import { env } from "../../config/env";
import {
    AIBoxBuildArtifacts,
    AIBoxBuildExecutionStatus,
    AIBoxBuildJobDTO,
    AIBoxBuildJobStatus,
    AIBoxBuildValidationReport
} from "../../interfaces/AIBoxBuildJob";
import { User } from "../../interfaces/User";
import { logger } from "../../middlewares/log";
import { createResponse, resp } from "../../utils/resp";
import { validateObjectIdInput } from "../common/ObjectIdPolicy";
import { normalizeAIBoxBuildArtifacts } from "./AIBoxBuildArtifactPolicy";
import { buildAIBoxBuildJobDTO } from "./AIBoxBuildDTOFactory";
import {
    buildAIBoxBuildRunQueuedState,
    buildAIBoxBuildValidationBlockedState
} from "./AIBoxBuildExecutionPolicy";
import {
    ACTIVE_AI_BOX_BUILD_EXECUTION_STATUSES,
    canAccessAIBoxBuildJob,
    validateAIBoxBuildRunStartState
} from "./AIBoxBuildJobPolicy";
import { aiBoxBuildJobRepository } from "./AIBoxBuildJobRepository";
import { AIBoxRunRequest, validateAIBoxRunRequest } from "./AIBoxBuildRunPolicy";
import {
    appendAIBoxRunLog,
    buildAIBoxRunLogPushUpdate
} from "./AIBoxBuildRunLogPolicy";
import { aiBoxBuildRuntimePreflightService } from "./AIBoxBuildRuntimePreflightService";
import { buildAIBoxBuildStaleRunMessage, selectStaleAIBoxBuildJobIds } from "./AIBoxBuildStaleJobPolicy";
import { validateAIBoxBuildArtifacts } from "./AIBoxBuildValidationPolicy";
import { AIBoxBuildRunExecutionService } from "./AIBoxBuildRunExecutionService";

type AIBoxBuildJobRepositoryPort = {
    findById(jobId: string): Promise<any | null>;
    findOneAndUpdate(query: unknown, update: unknown, options: unknown): Promise<any | null>;
    findLimited(query: unknown, limit: number): Promise<any[]>;
    updateMany(query: unknown, update: unknown): Promise<unknown>;
};

type RuntimePreflightPort = {
    validateRuntimePreflight(config: AIBoxRunRequest): Promise<resp<AIBoxBuildJobDTO | undefined> | undefined | null>;
};

type RunExecutionPort = {
    executeBuildRun(input: {
        jobId: string;
        config: AIBoxRunRequest;
        authorizationHeader: string;
        userSnapshot: User;
    }): Promise<unknown>;
};

type AIBoxBuildRunLaunchConfig = {
    blockedTargetNodes: string[];
    staleAfterMs: number;
    latestUbuntuServer: string;
};

type AIBoxBuildRunLaunchServiceDeps = {
    jobs?: AIBoxBuildJobRepositoryPort;
    runtimePreflight?: RuntimePreflightPort;
    runExecution?: RunExecutionPort;
    runningJobs?: Set<string>;
    config?: AIBoxBuildRunLaunchConfig;
};

const defaultLaunchConfig: AIBoxBuildRunLaunchConfig = {
    blockedTargetNodes: env.opencode.blockedTargetNodes,
    staleAfterMs: env.opencode.staleAfterMs,
    latestUbuntuServer: env.openai.boxBuildUbuntuServerLts
};

export class AIBoxBuildRunLaunchService {
    private readonly jobs: AIBoxBuildJobRepositoryPort;
    private readonly runtimePreflight: RuntimePreflightPort;
    private readonly runExecution: RunExecutionPort;
    private readonly runningJobs: Set<string>;
    private readonly config: AIBoxBuildRunLaunchConfig;

    constructor(deps: AIBoxBuildRunLaunchServiceDeps = {}) {
        this.jobs = deps.jobs ?? aiBoxBuildJobRepository;
        this.runtimePreflight = deps.runtimePreflight ?? aiBoxBuildRuntimePreflightService;
        this.runExecution = deps.runExecution ?? new AIBoxBuildRunExecutionService();
        this.runningJobs = deps.runningJobs ?? new Set<string>();
        this.config = deps.config ?? defaultLaunchConfig;
    }

    public async launch(input: {
        user: User;
        jobId: unknown;
        body: unknown;
        authorizationHeader: string;
    }): Promise<resp<AIBoxBuildJobDTO | undefined>> {
        try {
            const jobIdResult = validateObjectIdInput(input.jobId, "job_id");
            if (!jobIdResult.valid) return createResponse(400, jobIdResult.message);
            const normalizedJobId = jobIdResult.value;

            await this.markStaleExecutionJobs(normalizedJobId);

            const job = await this.jobs.findById(normalizedJobId);
            if (!job) return createResponse(404, "AI box build job not found");

            if (!canAccessAIBoxBuildJob(input.user.role, input.user._id?.toString(), job.requester_user_id)) {
                return createResponse(403, "You do not have permission to run this job");
            }

            const runConfig = validateAIBoxRunRequest(input.body, {
                blockedTargetNodes: this.config.blockedTargetNodes
            });
            if ("error" in runConfig) return runConfig.error;

            const artifacts = normalizeAIBoxBuildArtifacts(job.artifacts, job.direction);
            const validationReport = this.validateBuildArtifacts({
                direction: job.direction,
                constraints: job.constraints || "",
                allowAiAssistant: job.allow_ai_assistant,
                artifacts
            });
            if (validationReport.status === "blocked") {
                const blockedMessage = "AI build is blocked by artifact validation. Send feedback to regenerate the draft before running VM provisioning.";
                const blockedState = buildAIBoxBuildValidationBlockedState(blockedMessage);
                job.artifacts = artifacts;
                job.validation_report = validationReport;
                job.status = blockedState.status;
                job.execution_status = blockedState.execution_status;
                job.error_message = blockedState.error_message;
                job.run_logs = appendAIBoxRunLog(job.run_logs, "validation", "error", blockedMessage);
                await job.save();
                return createResponse(400, "AI build artifacts are blocked; regenerate or fix design.md/setup.md/writeup.md before starting a run", buildAIBoxBuildJobDTO(job));
            }

            const runtimePreflight = await this.runtimePreflight.validateRuntimePreflight(runConfig.value);
            if (runtimePreflight) return runtimePreflight;

            const startState = validateAIBoxBuildRunStartState(
                normalizedJobId,
                job.execution_status,
                this.runningJobs
            );
            if (!startState.allowed) {
                return createResponse(409, startState.message, buildAIBoxBuildJobDTO(job));
            }

            const queuedState = buildAIBoxBuildRunQueuedState(runConfig.value);
            const queuedJob = await this.jobs.findOneAndUpdate(
                {
                    _id: normalizedJobId,
                    $or: [
                        { execution_status: { $in: [AIBoxBuildExecutionStatus.idle, AIBoxBuildExecutionStatus.failed, AIBoxBuildExecutionStatus.ready_for_review] } },
                        { execution_status: { $exists: false } }
                    ]
                },
                {
                    $set: {
                        execution_status: queuedState.execution_status,
                        phase: queuedState.phase,
                        status: queuedState.status,
                        error_message: queuedState.error_message,
                        artifacts,
                        validation_report: validationReport,
                        provisioning: queuedState.provisioning,
                        updated_at: new Date()
                    },
                    ...buildAIBoxRunLogPushUpdate("run", "info", queuedState.log_message)
                },
                { new: true }
            );
            if (!queuedJob) {
                const latestJob = await this.jobs.findById(normalizedJobId);
                return createResponse(409, "This AI build job is already running or changed state; refresh before starting another run", latestJob ? buildAIBoxBuildJobDTO(latestJob) : undefined);
            }

            this.runningJobs.add(normalizedJobId);
            this.runExecution.executeBuildRun({
                jobId: normalizedJobId,
                config: runConfig.value,
                authorizationHeader: input.authorizationHeader,
                userSnapshot: input.user
            })
                .catch((error) => logger.error(`AI box build run ${normalizedJobId} failed outside handler:`, error))
                .finally(() => this.runningJobs.delete(normalizedJobId));

            return createResponse(202, "AI box build run started", buildAIBoxBuildJobDTO(queuedJob));
        } catch (error) {
            logger.error("Error in AIBoxBuildRunLaunchService.launch:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    private async markStaleExecutionJobs(jobId?: string): Promise<void> {
        const cutoff = new Date(Date.now() - this.config.staleAfterMs);
        const query: any = {
            execution_status: { $in: ACTIVE_AI_BOX_BUILD_EXECUTION_STATUSES }
        };
        if (jobId) query._id = jobId;

        const jobs = await this.jobs.findLimited(query, jobId ? 1 : 25);
        const staleIds = selectStaleAIBoxBuildJobIds(jobs, cutoff, this.runningJobs);
        if (staleIds.length === 0) return;

        const message = buildAIBoxBuildStaleRunMessage(this.config.staleAfterMs);
        await this.jobs.updateMany(
            { _id: { $in: staleIds } },
            {
                $set: {
                    execution_status: AIBoxBuildExecutionStatus.failed,
                    status: AIBoxBuildJobStatus.failed,
                    error_message: message,
                    updated_at: new Date()
                },
                ...buildAIBoxRunLogPushUpdate("run", "error", message)
            }
        );
    }

    private validateBuildArtifacts(input: {
        direction: string;
        constraints: string;
        allowAiAssistant: boolean;
        artifacts: AIBoxBuildArtifacts;
        agentError?: string;
    }): AIBoxBuildValidationReport {
        return validateAIBoxBuildArtifacts({
            ...input,
            latestUbuntuServer: this.config.latestUbuntuServer
        });
    }
}
