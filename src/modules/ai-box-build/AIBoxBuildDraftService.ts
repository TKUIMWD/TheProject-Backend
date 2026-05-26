import { env } from "../../config/env";
import {
    AIBoxBuildArtifacts,
    AIBoxBuildJobDTO,
    AIBoxBuildJobStatus,
    AIBoxBuildValidationReport
} from "../../interfaces/AIBoxBuildJob";
import { User } from "../../interfaces/User";
import { logger } from "../../middlewares/log";
import { createResponse, resp } from "../../utils/resp";
import { validateObjectIdInput } from "../common/ObjectIdPolicy";
import {
    mergeValidationIntoList,
    normalizeAIBoxBuildArtifacts,
    normalizeAIBoxBuildPhase,
    normalizeString,
    normalizeStringArray
} from "./AIBoxBuildArtifactPolicy";
import {
    AgentParsedResponse,
    buildAIBoxAgentFailureDraft,
    buildAIBoxAgentHistoryContent,
    publicAIBoxAgentError
} from "./AIBoxBuildAgentResponsePolicy";
import { aiBoxBuildAgentService } from "./AIBoxBuildAgentService";
import { buildAIBoxBuildJobDTO } from "./AIBoxBuildDTOFactory";
import { aiBoxBuildJobRepository } from "./AIBoxBuildJobRepository";
import {
    canAccessAIBoxBuildJob,
    validateAIBoxBuildDirection,
    validateAIBoxBuildMessage
} from "./AIBoxBuildJobPolicy";
import { validateAIBoxBuildArtifacts } from "./AIBoxBuildValidationPolicy";

type AIBoxBuildDraftAgent = {
    runInitialAgent(direction: string, constraints: string, allowAiAssistant: boolean): Promise<AgentParsedResponse>;
    runJobUpdate(job: any, message: string): Promise<AgentParsedResponse>;
};

type AIBoxBuildDraftRepository = {
    createJob(payload: unknown): Promise<any>;
    findById(jobId: string): Promise<any | null>;
};

type AIBoxBuildDraftServiceDeps = {
    agentService?: AIBoxBuildDraftAgent;
    jobRepo?: AIBoxBuildDraftRepository;
    latestUbuntuServer?: string;
    now?: () => Date;
};

export class AIBoxBuildDraftService {
    private readonly agentService: AIBoxBuildDraftAgent;
    private readonly jobRepo: AIBoxBuildDraftRepository;
    private readonly latestUbuntuServer: string;
    private readonly now: () => Date;

    constructor(deps: AIBoxBuildDraftServiceDeps = {}) {
        this.agentService = deps.agentService ?? aiBoxBuildAgentService;
        this.jobRepo = deps.jobRepo ?? aiBoxBuildJobRepository;
        this.latestUbuntuServer = deps.latestUbuntuServer ?? env.openai.boxBuildUbuntuServerLts;
        this.now = deps.now ?? (() => new Date());
    }

    public async createJob(input: {
        user: User;
        request: { direction?: unknown; constraints?: unknown; allow_ai_assistant?: unknown };
    }): Promise<resp<AIBoxBuildJobDTO | undefined>> {
        const { direction, constraints = "", allow_ai_assistant = true } = input.request;
        const directionPolicy = validateAIBoxBuildDirection({ direction, constraints });
        if (!directionPolicy.valid) return createResponse(400, directionPolicy.message);

        let parsed: AgentParsedResponse;
        let status = AIBoxBuildJobStatus.awaiting_review;
        let errorMessage = "";
        try {
            parsed = await this.agentService.runInitialAgent(
                directionPolicy.direction,
                directionPolicy.constraints,
                allow_ai_assistant !== false
            );
        } catch (error) {
            status = AIBoxBuildJobStatus.failed;
            errorMessage = publicAIBoxAgentError(error);
            parsed = buildAIBoxAgentFailureDraft(directionPolicy.direction, errorMessage);
        }

        const artifacts = normalizeAIBoxBuildArtifacts(parsed.artifacts, directionPolicy.direction);
        const validationReport = this.validateBuildArtifacts({
            direction: directionPolicy.direction,
            constraints: directionPolicy.constraints,
            allowAiAssistant: allow_ai_assistant !== false,
            artifacts,
            agentError: errorMessage
        });

        const createdAt = this.now();
        const job = await this.jobRepo.createJob({
            requester_user_id: input.user._id!.toString(),
            requester_role: input.user.role,
            direction: directionPolicy.direction,
            constraints: directionPolicy.constraints,
            allow_ai_assistant: allow_ai_assistant !== false,
            status,
            phase: normalizeAIBoxBuildPhase(parsed.phase),
            summary: normalizeString(parsed.summary),
            current_understanding: normalizeStringArray(parsed.current_understanding),
            open_questions: normalizeStringArray(parsed.open_questions),
            risks: mergeValidationIntoList(normalizeStringArray(parsed.risks), validationReport, 'risk'),
            next_actions: mergeValidationIntoList(normalizeStringArray(parsed.next_actions), validationReport, 'action'),
            artifacts,
            validation_report: validationReport,
            error_message: errorMessage,
            messages: [
                { role: 'user', content: directionPolicy.direction, created_at: createdAt },
                { role: 'agent', content: buildAIBoxAgentHistoryContent(parsed), created_at: createdAt }
            ]
        });

        logger.info(`AI box build job ${job._id} created by ${input.user.email}`);
        return createResponse(200, "AI box build job created", buildAIBoxBuildJobDTO(job));
    }

    public async addMessage(input: {
        user: User;
        jobId: unknown;
        request: { message?: unknown };
    }): Promise<resp<AIBoxBuildJobDTO | undefined>> {
        const jobIdResult = validateObjectIdInput(input.jobId, "job_id");
        if (!jobIdResult.valid) return createResponse(400, jobIdResult.message);
        const normalizedJobId = jobIdResult.value;

        const messagePolicy = validateAIBoxBuildMessage(input.request);
        if (!messagePolicy.valid) return createResponse(400, messagePolicy.message);

        const job = await this.jobRepo.findById(normalizedJobId);
        if (!job) return createResponse(404, "AI box build job not found");
        if (!canAccessAIBoxBuildJob(input.user.role, input.user._id?.toString(), job.requester_user_id)) {
            return createResponse(403, "You do not have permission to update this job");
        }

        let parsed: AgentParsedResponse;
        let errorMessage = "";
        try {
            parsed = await this.agentService.runJobUpdate(job, messagePolicy.message);
        } catch (error) {
            errorMessage = publicAIBoxAgentError(error);
            parsed = buildAIBoxAgentFailureDraft(job.direction, errorMessage, job.artifacts);
        }

        const artifacts = normalizeAIBoxBuildArtifacts(parsed.artifacts, job.direction);
        const validationReport = this.validateBuildArtifacts({
            direction: job.direction,
            constraints: job.constraints || "",
            allowAiAssistant: job.allow_ai_assistant,
            artifacts,
            agentError: errorMessage
        });

        const createdAt = this.now();
        job.messages.push({ role: 'user', content: messagePolicy.message, created_at: createdAt });
        job.messages.push({ role: 'agent', content: buildAIBoxAgentHistoryContent(parsed), created_at: createdAt });
        job.status = errorMessage ? AIBoxBuildJobStatus.failed : AIBoxBuildJobStatus.awaiting_review;
        job.phase = normalizeAIBoxBuildPhase(parsed.phase);
        job.summary = normalizeString(parsed.summary);
        job.current_understanding = normalizeStringArray(parsed.current_understanding);
        job.open_questions = normalizeStringArray(parsed.open_questions);
        job.risks = mergeValidationIntoList(normalizeStringArray(parsed.risks), validationReport, 'risk');
        job.next_actions = mergeValidationIntoList(normalizeStringArray(parsed.next_actions), validationReport, 'action');
        job.artifacts = artifacts;
        job.validation_report = validationReport;
        job.error_message = errorMessage;
        await job.save();

        logger.info(`AI box build job ${job._id} updated by ${input.user.email}`);
        return createResponse(200, "AI box build job updated", buildAIBoxBuildJobDTO(job));
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
            latestUbuntuServer: this.latestUbuntuServer
        });
    }
}

export const aiBoxBuildDraftService = new AIBoxBuildDraftService();
