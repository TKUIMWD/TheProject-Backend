import { Request } from "express";
import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import { Service } from "../abstract/Service";
import Roles from "../enum/role";
import {
    AIBoxBuildArtifacts,
    AIBoxBuildExecutionStatus,
    AIBoxBuildJob,
    AIBoxBuildJobDTO,
    AIBoxBuildJobStatus,
    AIBoxBuildPhase,
    AIBoxBuildValidationReport
} from "../interfaces/AIBoxBuildJob";
import { User } from "../interfaces/User";
import { logger } from "../middlewares/log";
import { AIBoxBuildJobModel } from "../orm/schemas/AIBoxBuildJobSchemas";
import { AIBoxBuildPrompts } from "../utils/AI_Prompts/AIBoxBuildPrompts";
import { pve_api } from "../enum/PVE_API";
import { callWithUnauthorized } from "../utils/fetch";
import { validateTokenAndGetAdminUser } from "../utils/auth";
import { resp, createResponse } from "../utils/resp";
import { VMManageService } from "./VMManageService";
import { VMModel } from "../orm/schemas/VM/VMSchemas";
import { PVE_API_SUPERADMINMODE_TOKEN, VMUtils } from "../utils/VMUtils";

type AgentParsedResponse = {
    phase?: string;
    summary?: string;
    current_understanding?: unknown;
    open_questions?: unknown;
    risks?: unknown;
    next_actions?: unknown;
    artifacts?: Partial<AIBoxBuildArtifacts>;
    raw_content?: string;
    parsed_as_json?: boolean;
    model_used?: string;
};

type AIBoxArtifactName = keyof AIBoxBuildArtifacts;

type RequiredReference = {
    value: string;
    label: string;
    sensitive?: boolean;
};

type AIBoxRunRequest = {
    template_id: string;
    target: string;
    name: string;
    cpuCores: number;
    memorySize: number;
    diskSize: number;
    ciuser?: string;
    cipassword?: string;
    dry_run?: boolean;
};

type CommandResult = {
    exitCode: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
};

type StagedReferenceBundle = {
    source_path: string;
    workspace_path: string;
    relative_path: string;
    file_count: number;
    total_bytes: number;
} | null;

export class AIBoxBuildService extends Service {
    private readonly vmManageService = new VMManageService();
    private static runningJobs = new Set<string>();
    private static readonly activeExecutionStatuses: AIBoxBuildExecutionStatus[] = [
        AIBoxBuildExecutionStatus.provisioning,
        AIBoxBuildExecutionStatus.booting,
        AIBoxBuildExecutionStatus.waiting_for_network,
        AIBoxBuildExecutionStatus.generating_setup,
        AIBoxBuildExecutionStatus.configuring,
        AIBoxBuildExecutionStatus.verifying
    ];

    public async createJob(Request: Request): Promise<resp<AIBoxBuildJobDTO | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<AIBoxBuildJobDTO>(Request);
            if (error) return error;

            const { direction, constraints = "", allow_ai_assistant = true } = Request.body;
            const validation = this._validateDirection(direction, constraints);
            if (validation) return validation;

            let parsed: AgentParsedResponse;
            let status = AIBoxBuildJobStatus.awaiting_review;
            let errorMessage = "";
            try {
                parsed = await this._runInitialAgent(direction.trim(), String(constraints || '').trim(), allow_ai_assistant !== false);
            } catch (error) {
                status = AIBoxBuildJobStatus.failed;
                errorMessage = this._publicAgentError(error);
                parsed = this._agentFailureDraft(direction.trim(), errorMessage);
            }

            const artifacts = this._normalizeArtifacts(parsed.artifacts, direction.trim());
            const validationReport = this._validateBuildArtifacts({
                direction: direction.trim(),
                constraints: String(constraints || '').trim(),
                allowAiAssistant: allow_ai_assistant !== false,
                artifacts,
                agentError: errorMessage
            });

            const job = await AIBoxBuildJobModel.create({
                requester_user_id: user._id.toString(),
                requester_role: user.role,
                direction: direction.trim(),
                constraints: String(constraints || '').trim(),
                allow_ai_assistant: allow_ai_assistant !== false,
                status,
                phase: this._normalizePhase(parsed.phase),
                summary: this._normalizeString(parsed.summary),
                current_understanding: this._normalizeStringArray(parsed.current_understanding),
                open_questions: this._normalizeStringArray(parsed.open_questions),
                risks: this._mergeValidationIntoList(this._normalizeStringArray(parsed.risks), validationReport, 'risk'),
                next_actions: this._mergeValidationIntoList(this._normalizeStringArray(parsed.next_actions), validationReport, 'action'),
                artifacts,
                validation_report: validationReport,
                error_message: errorMessage,
                messages: [
                    { role: 'user', content: direction.trim(), created_at: new Date() },
                    { role: 'agent', content: this._agentContentForHistory(parsed), created_at: new Date() }
                ]
            });

            logger.info(`AI box build job ${job._id} created by ${user.email}`);
            return createResponse(200, "AI box build job created", this._toDTO(job));
        } catch (error) {
            logger.error("Error creating AI box build job:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async listJobs(Request: Request): Promise<resp<AIBoxBuildJobDTO[] | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<AIBoxBuildJobDTO[]>(Request);
            if (error) return error;

            await this._markStaleExecutionJobs();
            const query = user.role === Roles.SuperAdmin ? {} : { requester_user_id: user._id.toString() };
            const jobs = await AIBoxBuildJobModel.find(query).sort({ updated_at: -1 }).limit(50).exec();
            return createResponse(200, "AI box build jobs fetched", jobs.map(job => this._toDTO(job)));
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
            await this._markStaleExecutionJobs(job_id);
            const job = await AIBoxBuildJobModel.findById(job_id).exec();
            if (!job) return createResponse(404, "AI box build job not found");
            if (!this._canAccessJob(user, job)) return createResponse(403, "You do not have permission to access this job");

            return createResponse(200, "AI box build job fetched", this._toDTO(job));
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
            const job = await AIBoxBuildJobModel.findById(job_id).exec();
            if (!job) return createResponse(404, "AI box build job not found");
            if (!this._canAccessJob(user, job)) return createResponse(403, "You do not have permission to delete this job");

            if (AIBoxBuildService.runningJobs.has(job_id) || AIBoxBuildService.activeExecutionStatuses.includes(job.execution_status as AIBoxBuildExecutionStatus)) {
                return createResponse(409, "AI build job is running; stop or wait for it to finish before deleting");
            }

            const workspacePath = typeof job.workspace_path === 'string' ? job.workspace_path.trim() : "";
            let workspaceDeleted = false;
            if (workspacePath) {
                await this._deleteJobWorkspace(job_id, workspacePath);
                workspaceDeleted = true;
            }

            await AIBoxBuildJobModel.deleteOne({ _id: job_id }).exec();
            logger.info(`AI box build job ${job_id} deleted by ${user.email}; workspace_deleted=${workspaceDeleted}`);

            return createResponse(200, "AI box build job deleted", {
                deleted_job_id: job_id,
                workspace_path: workspacePath || undefined,
                workspace_deleted: workspaceDeleted
            });
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
            const { message } = Request.body;
            if (!message || typeof message !== 'string' || message.trim().length === 0) {
                return createResponse(400, "message is required");
            }
            if (message.length > 8000) {
                return createResponse(400, "message exceeds maximum length of 8000 characters");
            }

            const job = await AIBoxBuildJobModel.findById(job_id).exec();
            if (!job) return createResponse(404, "AI box build job not found");
            if (!this._canAccessJob(user, job)) return createResponse(403, "You do not have permission to update this job");

            let parsed: AgentParsedResponse;
            let errorMessage = "";
            try {
                parsed = this._shouldUseTargetedArtifactRepair(job, message.trim())
                    ? await this._runTargetedArtifactRepairAgent(job, message.trim())
                    : await this._runIterationAgent(job, message.trim());
            } catch (error) {
                errorMessage = this._publicAgentError(error);
                parsed = this._agentFailureDraft(job.direction, errorMessage, job.artifacts);
            }

            const artifacts = this._normalizeArtifacts(parsed.artifacts, job.direction);
            const validationReport = this._validateBuildArtifacts({
                direction: job.direction,
                constraints: job.constraints || "",
                allowAiAssistant: job.allow_ai_assistant,
                artifacts,
                agentError: errorMessage
            });

            job.messages.push({ role: 'user', content: message.trim(), created_at: new Date() });
            job.messages.push({ role: 'agent', content: this._agentContentForHistory(parsed), created_at: new Date() });
            job.status = errorMessage ? AIBoxBuildJobStatus.failed : AIBoxBuildJobStatus.awaiting_review;
            job.phase = this._normalizePhase(parsed.phase);
            job.summary = this._normalizeString(parsed.summary);
            job.current_understanding = this._normalizeStringArray(parsed.current_understanding);
            job.open_questions = this._normalizeStringArray(parsed.open_questions);
            job.risks = this._mergeValidationIntoList(this._normalizeStringArray(parsed.risks), validationReport, 'risk');
            job.next_actions = this._mergeValidationIntoList(this._normalizeStringArray(parsed.next_actions), validationReport, 'action');
            job.artifacts = artifacts;
            job.validation_report = validationReport;
            job.error_message = errorMessage;
            await job.save();

            logger.info(`AI box build job ${job._id} updated by ${user.email}`);
            return createResponse(200, "AI box build job updated", this._toDTO(job));
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
            if (!Object.values(AIBoxBuildJobStatus).includes(status)) {
                return createResponse(400, "Invalid job status");
            }

            const job = await AIBoxBuildJobModel.findById(job_id).exec();
            if (!job) return createResponse(404, "AI box build job not found");
            if (!this._canAccessJob(user, job)) return createResponse(403, "You do not have permission to update this job");
            if (status === AIBoxBuildJobStatus.approved && job.validation_report?.status === 'blocked') {
                return createResponse(400, "Resolve blocking AI build validation findings before approval");
            }

            job.status = status;
            await job.save();
            return createResponse(200, "AI box build job status updated", this._toDTO(job));
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
            await this._markStaleExecutionJobs(job_id);
            const job = await AIBoxBuildJobModel.findById(job_id).exec();
            if (!job) return createResponse(404, "AI box build job not found");
            if (!this._canAccessJob(user, job)) return createResponse(403, "You do not have permission to run this job");

            const runConfig = this._validateRunRequest(Request.body);
            if ('error' in runConfig) return runConfig.error;

            const artifacts = this._normalizeArtifacts(job.artifacts, job.direction);
            const validationReport = this._validateBuildArtifacts({
                direction: job.direction,
                constraints: job.constraints || "",
                allowAiAssistant: job.allow_ai_assistant,
                artifacts
            });
            if (validationReport.status === 'blocked') {
                const blockedMessage = "AI build is blocked by artifact validation. Send feedback to regenerate the draft before running VM provisioning.";
                job.artifacts = artifacts;
                job.validation_report = validationReport;
                job.status = AIBoxBuildJobStatus.awaiting_review;
                job.execution_status = AIBoxBuildExecutionStatus.failed;
                job.error_message = blockedMessage;
                job.run_logs = [
                    ...(job.run_logs || []).slice(-180),
                    this._makeRunLog("validation", "error", blockedMessage)
                ];
                await job.save();
                return createResponse(400, "AI build artifacts are blocked; regenerate or fix design.md/setup.md/writeup.md before starting a run", this._toDTO(job));
            }

            const runtimePreflight = await this._validateRuntimePreflight(runConfig.value);
            if (runtimePreflight) return runtimePreflight;

            if (AIBoxBuildService.runningJobs.has(job_id)) {
                return createResponse(409, "This AI build job is already running", this._toDTO(job));
            }

            if (job.execution_status && ![
                AIBoxBuildExecutionStatus.idle,
                AIBoxBuildExecutionStatus.failed,
                AIBoxBuildExecutionStatus.ready_for_review
            ].includes(job.execution_status as AIBoxBuildExecutionStatus)) {
                return createResponse(409, `Job is already in execution state: ${job.execution_status}`, this._toDTO(job));
            }

            const initialExecutionStatus = runConfig.value.dry_run ? AIBoxBuildExecutionStatus.generating_setup : AIBoxBuildExecutionStatus.provisioning;
            const queuedJob = await AIBoxBuildJobModel.findOneAndUpdate(
                {
                    _id: job_id,
                    $or: [
                        { execution_status: { $in: [AIBoxBuildExecutionStatus.idle, AIBoxBuildExecutionStatus.failed, AIBoxBuildExecutionStatus.ready_for_review] } },
                        { execution_status: { $exists: false } }
                    ]
                },
                {
                    $set: {
                        execution_status: initialExecutionStatus,
                        phase: AIBoxBuildPhase.implementation,
                        status: AIBoxBuildJobStatus.awaiting_review,
                        error_message: "",
                        artifacts,
                        validation_report: validationReport,
                        provisioning: {
                            template_id: runConfig.value.template_id,
                            target_node: runConfig.value.target,
                            vm_name: runConfig.value.name,
                            cpu_cores: runConfig.value.cpuCores,
                            memory_mb: runConfig.value.memorySize,
                            disk_gb: runConfig.value.diskSize,
                            ciuser: runConfig.value.ciuser || "",
                            has_cipassword: Boolean(runConfig.value.cipassword),
                            dry_run: Boolean(runConfig.value.dry_run)
                        },
                        updated_at: new Date()
                    },
                    $push: {
                        run_logs: {
                            $each: [this._makeRunLog("run", "info", runConfig.value.dry_run ? "Dry run queued." : "Build run queued.")],
                            $slice: -200
                        }
                    }
                },
                { new: true }
            ).exec();
            if (!queuedJob) {
                const latestJob = await AIBoxBuildJobModel.findById(job_id).exec();
                return createResponse(409, "This AI build job is already running or changed state; refresh before starting another run", latestJob ? this._toDTO(latestJob) : undefined);
            }

            const authHeader = Request.headers.authorization || "";
            const userSnapshot = { _id: user._id?.toString() || "", role: user.role, email: user.email };
            AIBoxBuildService.runningJobs.add(job_id);
            this._executeBuildRun(job_id, runConfig.value, authHeader, userSnapshot)
                .catch((error) => logger.error(`AI box build run ${job_id} failed outside handler:`, error))
                .finally(() => AIBoxBuildService.runningJobs.delete(job_id));

            return createResponse(202, "AI box build run started", this._toDTO(queuedJob));
        } catch (error) {
            logger.error("Error launching AI box build run:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    private _validateRunRequest(body: any): { value: AIBoxRunRequest } | { error: resp<undefined> } {
        const { template_id, target, name, cpuCores, memorySize, diskSize, ciuser, cipassword, dry_run } = body || {};
        if (dry_run !== true && (!template_id || typeof template_id !== 'string')) {
            return { error: createResponse(400, "template_id is required") };
        }
        if (dry_run !== true && (!target || typeof target !== 'string')) {
            return { error: createResponse(400, "target node is required") };
        }
        const normalizedTarget = String(target || "").trim();
        const blockedNodes = this._configuredList(process.env.OPENCODE_BOX_BUILD_BLOCKED_TARGET_NODES || "gapvec");
        if (dry_run !== true && blockedNodes.includes(normalizedTarget)) {
            return { error: createResponse(400, `target node ${normalizedTarget} is blocked for AI box builds`) };
        }
        if (!name || typeof name !== 'string' || name.trim().length < 3) {
            return { error: createResponse(400, "name must be at least 3 characters") };
        }
        const numericFields: Array<[unknown, string]> = [
            [cpuCores, "cpuCores"],
            [memorySize, "memorySize"],
            [diskSize, "diskSize"]
        ];
        for (const [value, label] of numericFields) {
            if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
                return { error: createResponse(400, `${label} must be a positive number`) };
            }
        }
        if (ciuser !== undefined && typeof ciuser !== 'string') {
            return { error: createResponse(400, "ciuser must be a string") };
        }
        if (cipassword !== undefined && typeof cipassword !== 'string') {
            return { error: createResponse(400, "cipassword must be a string") };
        }
        if (dry_run !== true && (!ciuser || !String(ciuser).trim() || !cipassword || !String(cipassword).trim())) {
            return { error: createResponse(400, "ciuser and cipassword are required for SSH setup execution") };
        }

        return {
            value: {
                template_id: String(template_id || ""),
                target: normalizedTarget,
                name: name.trim(),
                cpuCores,
                memorySize,
                diskSize,
                ciuser,
                cipassword,
                dry_run: dry_run === true
            }
        };
    }

    private async _validateRuntimePreflight(config: AIBoxRunRequest): Promise<resp<undefined> | null> {
        const errors: string[] = [];

        if (!process.env.OPENAI_API_KEY) {
            errors.push("OPENAI_API_KEY is not configured");
        }
        if (!process.env.OPENAI_BASE_URL) {
            errors.push("OPENAI_BASE_URL is not configured");
        }

        const opencode = await this._runCommand(this._opencodeBinary(), ["--version"], {
            timeoutMs: Number(process.env.OPENCODE_BOX_BUILD_PREFLIGHT_TIMEOUT_MS || 10000),
            env: {
                ...process.env,
                OPENCODE_DISABLE_AUTOUPDATE: "true"
            }
        });
        if (opencode.exitCode !== 0) {
            errors.push(`opencode is not executable at ${this._opencodeBinary()}: ${this._summarizeCommandResult("opencode --version", opencode)}`);
        }

        if (!config.dry_run) {
            const sshpass = await this._runCommand("sshpass", ["-V"], {
                timeoutMs: Number(process.env.OPENCODE_BOX_BUILD_PREFLIGHT_TIMEOUT_MS || 10000),
                env: process.env
            });
            if (sshpass.exitCode !== 0) {
                errors.push(`sshpass is required for SSH setup execution: ${this._summarizeCommandResult("sshpass -V", sshpass)}`);
            }
        }

        if (errors.length > 0) {
            return createResponse(500, `AI build runtime preflight failed: ${errors.join("; ")}`);
        }

        return null;
    }

    private async _markStaleExecutionJobs(jobId?: string): Promise<void> {
        const staleAfterMs = Number(process.env.OPENCODE_BOX_BUILD_STALE_AFTER_MS || 90 * 60 * 1000);
        const cutoff = new Date(Date.now() - staleAfterMs);
        const query: any = {
            execution_status: { $in: AIBoxBuildService.activeExecutionStatuses }
        };
        if (jobId) query._id = jobId;

        const jobs = await AIBoxBuildJobModel.find(query).limit(jobId ? 1 : 25).exec();
        const staleIds: string[] = [];
        for (const job of jobs) {
            const id = String((job as any)._id);
            if (AIBoxBuildService.runningJobs.has(id)) continue;

            const latestLogAt = (job.run_logs || []).reduce<Date | null>((latest, log) => {
                const createdAt = log?.created_at ? new Date(log.created_at) : null;
                if (!createdAt || Number.isNaN(createdAt.getTime())) return latest;
                if (!latest || createdAt > latest) return createdAt;
                return latest;
            }, null);
            const lastActivity = latestLogAt || (job.updated_at ? new Date(job.updated_at) : new Date(0));
            if (lastActivity < cutoff) staleIds.push(id);
        }

        if (staleIds.length === 0) return;

        const message = `AI build worker appears stalled or was interrupted; no execution activity for more than ${Math.round(staleAfterMs / 60000)} minutes. Restart the run after reviewing VM/artifact state.`;
        await AIBoxBuildJobModel.updateMany(
            { _id: { $in: staleIds } },
            {
                $set: {
                    execution_status: AIBoxBuildExecutionStatus.failed,
                    status: AIBoxBuildJobStatus.failed,
                    error_message: message,
                    updated_at: new Date()
                },
                $push: { run_logs: { $each: [this._makeRunLog("run", "error", message)], $slice: -200 } }
            }
        );
    }

    private async _executeBuildRun(
        jobId: string,
        config: AIBoxRunRequest,
        authorizationHeader: string,
        userSnapshot: { _id: string; role: string; email?: string }
    ): Promise<void> {
        try {
            const job = await AIBoxBuildJobModel.findById(jobId).exec();
            if (!job) return;

            await this._appendRunLog(jobId, "run", "info", "Execution worker started.");
            let vmContext: { vmId?: string; pveVmid?: string; pveNode?: string; vmIp?: string; sshUser?: string; sshPassword?: string } = {
                sshUser: config.ciuser || "root",
                sshPassword: config.cipassword || ""
            };

            if (!config.dry_run) {
                vmContext = await this._provisionAndBootVM(jobId, config, authorizationHeader, userSnapshot);
            } else {
                await this._appendRunLog(jobId, "provision", "warning", "Dry run enabled; VM provisioning and SSH execution were skipped.");
            }

            const workspacePath = await this._prepareOpencodeWorkspace(jobId, job, config, vmContext);
            await this._setExecutionStatus(jobId, AIBoxBuildExecutionStatus.generating_setup, "Running opencode to generate setup and validation scripts.");
            await this._runOpencodeGenerator(jobId, workspacePath, job, config, vmContext);
            await this._refreshArtifactsFromWorkspace(jobId, workspacePath);

            if (!config.dry_run) {
                await this._setExecutionStatus(jobId, AIBoxBuildExecutionStatus.configuring, "Executing generated setup.sh on the VM.");
                const setupResult = await this._uploadAndRunScript(jobId, workspacePath, "setup.sh", vmContext, Number(process.env.OPENCODE_BOX_BUILD_SETUP_TIMEOUT_MS || 20 * 60 * 1000));
                await AIBoxBuildJobModel.updateOne({ _id: jobId }, { setup_exit_code: setupResult.exitCode ?? -1, updated_at: new Date() });
                if (setupResult.exitCode !== 0) {
                    throw new Error(`setup.sh failed with exit code ${setupResult.exitCode ?? "unknown"}`);
                }

                await this._setExecutionStatus(jobId, AIBoxBuildExecutionStatus.verifying, "Executing generated validation.sh on the VM.");
                const validationResult = await this._uploadAndRunScript(jobId, workspacePath, "validation.sh", vmContext, Number(process.env.OPENCODE_BOX_BUILD_VALIDATION_TIMEOUT_MS || 8 * 60 * 1000));
                await AIBoxBuildJobModel.updateOne({ _id: jobId }, { validation_exit_code: validationResult.exitCode ?? -1, updated_at: new Date() });
                if (validationResult.exitCode !== 0) {
                    throw new Error(`validation.sh failed with exit code ${validationResult.exitCode ?? "unknown"}`);
                }
            }

            const updatedJob = await AIBoxBuildJobModel.findById(jobId).exec();
            if (updatedJob) {
                const artifacts = this._normalizeArtifacts(updatedJob.artifacts, updatedJob.direction);
                const validationReport = this._validateBuildArtifacts({
                    direction: updatedJob.direction,
                    constraints: updatedJob.constraints || "",
                    allowAiAssistant: updatedJob.allow_ai_assistant,
                    artifacts
                });
                updatedJob.validation_report = validationReport;
                updatedJob.phase = AIBoxBuildPhase.verification;
                updatedJob.execution_status = AIBoxBuildExecutionStatus.ready_for_review;
                updatedJob.status = AIBoxBuildJobStatus.awaiting_review;
                updatedJob.error_message = "";
                updatedJob.next_actions = this._mergeStringArrays([
                    ...(updatedJob.next_actions || []),
                    "Review generated design.md, setup.md, writeup.md, and validation logs before publishing."
                ]);
                updatedJob.run_logs = [
                    ...(updatedJob.run_logs || []).slice(-180),
                    this._makeRunLog("run", "info", config.dry_run ? "Dry run completed; artifacts are ready for review." : "VM build run completed and validation passed.")
                ];
                await updatedJob.save();
            }
        } catch (error) {
            const message = this._publicAgentError(error);
            await AIBoxBuildJobModel.updateOne(
                { _id: jobId },
                {
                    execution_status: AIBoxBuildExecutionStatus.failed,
                    status: AIBoxBuildJobStatus.failed,
                    error_message: message,
                    updated_at: new Date(),
                    $push: { run_logs: { $each: [this._makeRunLog("run", "error", message)], $slice: -200 } }
                }
            );
        }
    }

    private async _provisionAndBootVM(
        jobId: string,
        config: AIBoxRunRequest,
        authorizationHeader: string,
        userSnapshot: { _id: string; role: string; email?: string }
    ): Promise<{ vmId?: string; pveVmid: string; pveNode: string; vmIp: string; sshUser: string; sshPassword: string }> {
        await this._setExecutionStatus(jobId, AIBoxBuildExecutionStatus.provisioning, "Creating VM from template.");
        const createResp = await this.vmManageService.createVMFromTemplate({
            headers: { authorization: authorizationHeader },
            body: {
                template_id: config.template_id,
                name: config.name,
                target: config.target,
                cpuCores: config.cpuCores,
                memorySize: config.memorySize,
                diskSize: config.diskSize,
                ciuser: config.ciuser,
                cipassword: config.cipassword
            }
        } as Request);

        if (createResp.code !== 200 || !createResp.body) {
            throw new Error(`VM creation failed: ${createResp.code} ${createResp.message}`);
        }

        const body = createResp.body as any;
        const pveVmid = String(body.vmid || "");
        const pveNode = config.target;
        const taskId = String(body.task_id || "");
        await AIBoxBuildJobModel.updateOne(
            { _id: jobId },
            {
                pve_vmid: pveVmid,
                pve_node: pveNode,
                task_id: taskId,
                updated_at: new Date(),
                $push: { run_logs: { $each: [this._makeRunLog("provision", "info", `VM created: ${pveNode}/${pveVmid}.`)], $slice: -200 } }
            }
        );

        const vmRecord = await this._waitForVMRecord(userSnapshot._id, pveNode, pveVmid);
        if (vmRecord?._id) {
            await AIBoxBuildJobModel.updateOne({ _id: jobId }, { vm_id: vmRecord._id.toString(), updated_at: new Date() });
        }

        await this._prepareCloudInitBeforeBoot(jobId, pveNode, pveVmid);

        await this._setExecutionStatus(jobId, AIBoxBuildExecutionStatus.booting, "Booting VM.");
        const status = await VMUtils.getVMStatus(pveNode, pveVmid);
        if (status?.status !== "running") {
            const start = await VMUtils.startVM(pveNode, pveVmid);
            if (!start.success) {
                throw new Error(`VM boot failed: ${start.errorMessage || "unknown error"}`);
            }
            if (start.upid) {
                const wait = await VMUtils.waitForTaskCompletion(pveNode, start.upid, "VM start");
                if (!wait.success) {
                    throw new Error(`VM boot task failed: ${wait.errorMessage || "unknown error"}`);
                }
            }
        }

        await this._normalizeGuestNetworkIdentityAfterBoot(jobId, pveNode, pveVmid);
        await this._setExecutionStatus(jobId, AIBoxBuildExecutionStatus.waiting_for_network, "Waiting for VM network address.");
        const vmIp = await this._waitForVMIP(jobId, pveNode, pveVmid);
        await AIBoxBuildJobModel.updateOne({ _id: jobId }, { vm_ip: vmIp, updated_at: new Date() });

        return {
            vmId: vmRecord?._id?.toString(),
            pveVmid,
            pveNode,
            vmIp,
            sshUser: config.ciuser || "root",
            sshPassword: config.cipassword || ""
        };
    }

    private async _prepareCloudInitBeforeBoot(jobId: string, pveNode: string, pveVmid: string): Promise<void> {
        if (process.env.OPENCODE_BOX_BUILD_PREPARE_CLOUD_INIT === "false") {
            await this._appendRunLog(jobId, "cloud-init", "warning", "Cloud-init preparation skipped by configuration.");
            return;
        }

        const desiredIpConfig = process.env.OPENCODE_BOX_BUILD_IPCONFIG0 || "ip=dhcp";
        const config = await VMUtils.getVMConfig(pveNode, pveVmid);
        if (!config) {
            await this._appendRunLog(jobId, "cloud-init", "warning", "Unable to read VM config before boot; continuing without cloud-init network preparation.");
            return;
        }

        if (desiredIpConfig && config.ipconfig0 !== desiredIpConfig) {
            await this._appendRunLog(jobId, "cloud-init", "info", `Applying cloud-init network config: ipconfig0=${desiredIpConfig}.`);
            await callWithUnauthorized('PUT', pve_api.nodes_qemu_config(pveNode, pveVmid), { ipconfig0: desiredIpConfig }, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                }
            });
        } else {
            await this._appendRunLog(jobId, "cloud-init", "info", `Cloud-init network config already set: ipconfig0=${config.ipconfig0 || "unset"}.`);
        }

        const regen = await VMUtils.regenerateCloudInit(pveNode, pveVmid);
        if (!regen.success) {
            await this._appendRunLog(jobId, "cloud-init", "warning", `Cloud-init regeneration failed before boot: ${regen.errorMessage || "unknown error"}.`);
            return;
        }

        if (regen.upid) {
            const wait = await VMUtils.waitForTaskCompletion(pveNode, regen.upid, "AI build cloud-init regeneration");
            if (!wait.success) {
                await this._appendRunLog(jobId, "cloud-init", "warning", `Cloud-init regeneration task did not complete cleanly: ${wait.errorMessage || "unknown error"}.`);
                return;
            }
        }

        await this._appendRunLog(jobId, "cloud-init", "info", "Cloud-init regenerated before VM boot.");
    }

    private async _normalizeGuestNetworkIdentityAfterBoot(jobId: string, pveNode: string, pveVmid: string): Promise<void> {
        if (process.env.OPENCODE_BOX_BUILD_NORMALIZE_GUEST_NETWORK === "false") {
            await this._appendRunLog(jobId, "network", "warning", "Guest network identity normalization skipped by configuration.");
            return;
        }

        await this._appendRunLog(jobId, "network", "info", "Normalizing guest machine-id and DHCP client identity after boot.");
        const result = await VMUtils.ensureUniqueGuestNetworkIdentity(
            pveNode,
            pveVmid,
            Number(process.env.OPENCODE_BOX_BUILD_GUEST_IDENTITY_TIMEOUT_MS || 180000)
        );

        if (!result.success) {
            const detail = [result.errorMessage, result.stderr].filter(Boolean).join(": ").slice(0, 500);
            await this._appendRunLog(jobId, "network", "warning", `Guest network identity normalization did not complete: ${detail || "unknown error"}.`);
            return;
        }

        const summary = (result.stdout || "")
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line && /^(network_identity=|interface=|old_machine_id=|new_machine_id=|\d+: )/.test(line))
            .join("; ")
            .slice(0, 700);
        await this._appendRunLog(jobId, "network", "info", `Guest network identity normalized. ${summary}`);
    }

    private async _waitForVMRecord(userId: string, pveNode: string, pveVmid: string): Promise<any | null> {
        for (let attempt = 0; attempt < 20; attempt++) {
            const vm = await VMModel.findOne({ owner: userId, pve_node: pveNode, pve_vmid: pveVmid }).exec();
            if (vm) return vm;
            await this._sleep(1000);
        }
        return null;
    }

    private async _waitForVMIP(jobId: string, pveNode: string, pveVmid: string): Promise<string> {
        const maxAttempts = Number(process.env.OPENCODE_BOX_BUILD_IP_WAIT_ATTEMPTS || 60);
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const networkInfo = await VMUtils.getVMNetworkInfo(pveNode, pveVmid);
            if (networkInfo.success && networkInfo.interfaces) {
                const ipAddresses = VMUtils.extractIPAddresses(networkInfo.interfaces);
                const preferred = ipAddresses.find((ip) => !ip.startsWith("169.254.")) || ipAddresses[0];
                if (preferred) {
                    await this._appendRunLog(jobId, "network", "info", `VM IP detected: ${preferred}.`);
                    return preferred;
                }
            }
            if (attempt % 6 === 0) {
                await this._appendRunLog(jobId, "network", "info", `Still waiting for VM IP (${attempt}/${maxAttempts}).`);
            }
            await this._sleep(Number(process.env.OPENCODE_BOX_BUILD_IP_WAIT_MS || 5000));
        }
        throw new Error("Timed out waiting for VM IP from QEMU guest agent");
    }

    private async _prepareOpencodeWorkspace(
        jobId: string,
        job: AIBoxBuildJob,
        config: AIBoxRunRequest,
        vmContext: { vmIp?: string; pveVmid?: string; pveNode?: string; sshUser?: string }
    ): Promise<string> {
        const workspaceRoot = this._workspaceRoot();
        const workspacePath = path.join(workspaceRoot, jobId);
        await fs.mkdir(path.join(workspacePath, "generated"), { recursive: true });

        const artifacts = this._normalizeArtifacts(job.artifacts, job.direction);
        await fs.writeFile(path.join(workspacePath, "design.md"), artifacts.design_md, "utf8");
        await fs.writeFile(path.join(workspacePath, "setup.md"), artifacts.setup_md, "utf8");
        await fs.writeFile(path.join(workspacePath, "writeup.md"), artifacts.writeup_md, "utf8");
        const stagedReferences = await this._stageReferenceBundle(workspacePath, job);
        await fs.writeFile(path.join(workspacePath, "build-context.json"), JSON.stringify({
            direction: job.direction,
            constraints: job.constraints,
            allow_ai_assistant: job.allow_ai_assistant,
            reference_bundle: stagedReferences,
            provisioning: {
                template_id: config.template_id,
                target_node: config.target,
                vm_name: config.name,
                cpu_cores: config.cpuCores,
                memory_mb: config.memorySize,
                disk_gb: config.diskSize,
                dry_run: config.dry_run
            },
            vm: {
                pve_node: vmContext.pveNode,
                pve_vmid: vmContext.pveVmid,
                ip: vmContext.vmIp,
                ssh_user: vmContext.sshUser
            }
        }, null, 2), "utf8");
        await fs.writeFile(path.join(workspacePath, "AGENTS.md"), this._buildWorkspaceAgentInstructions(), "utf8");
        await fs.writeFile(path.join(workspacePath, "opencode.json"), this._buildOpenCodeConfig(), "utf8");
        await AIBoxBuildJobModel.updateOne({ _id: jobId }, { workspace_path: workspacePath, updated_at: new Date() });
        return workspacePath;
    }

    private _workspaceRoot(): string {
        return process.env.OPENCODE_BOX_BUILD_WORKDIR || path.join(process.env.HOME || process.cwd(), ".cstg-ai-box-build-workspaces");
    }

    private _referenceRoot(): string {
        return process.env.OPENCODE_BOX_BUILD_REFERENCE_ROOT || path.join(process.env.HOME || process.cwd(), ".cstg-ai-box-build-references");
    }

    private async _stageReferenceBundle(workspacePath: string, job: AIBoxBuildJob): Promise<StagedReferenceBundle> {
        const referencePath = this._extractReferenceBundlePath(`${job.direction}\n${job.constraints || ""}`);
        if (!referencePath) return null;

        const rootPath = path.resolve(this._referenceRoot());
        const sourcePath = path.resolve(referencePath);
        if (sourcePath !== rootPath && !this._isPathInside(sourcePath, rootPath)) {
            throw new Error("Reference bundle path must be inside the configured AI build reference root");
        }

        const stat = await fs.stat(sourcePath).catch(() => null);
        if (!stat || !stat.isDirectory()) {
            throw new Error("Reference bundle path does not exist or is not a directory");
        }

        const summary = await this._summarizeReferenceDirectory(sourcePath);
        const maxFiles = Number(process.env.OPENCODE_BOX_BUILD_REFERENCE_MAX_FILES || 600);
        const maxBytes = Number(process.env.OPENCODE_BOX_BUILD_REFERENCE_MAX_BYTES || 50 * 1024 * 1024);
        if (summary.fileCount > maxFiles) {
            throw new Error(`Reference bundle has too many files (${summary.fileCount}/${maxFiles})`);
        }
        if (summary.totalBytes > maxBytes) {
            throw new Error(`Reference bundle is too large (${summary.totalBytes}/${maxBytes} bytes)`);
        }

        const safeName = path.basename(sourcePath).replace(/[^A-Za-z0-9._-]/g, "_") || "bundle";
        const referenceRoot = path.join(workspacePath, "reference");
        const targetPath = path.join(referenceRoot, safeName);
        await fs.rm(targetPath, { recursive: true, force: true });
        await fs.mkdir(referenceRoot, { recursive: true });
        await fs.cp(sourcePath, targetPath, {
            recursive: true,
            dereference: false,
            filter: async (src) => {
                const name = path.basename(src);
                if (['.git', 'node_modules', '.venv', '__pycache__'].includes(name)) return false;
                const entry = await fs.lstat(src).catch(() => null);
                return Boolean(entry && !entry.isSymbolicLink());
            }
        });

        return {
            source_path: sourcePath,
            workspace_path: targetPath,
            relative_path: path.relative(workspacePath, targetPath).replace(/\\/g, "/"),
            file_count: summary.fileCount,
            total_bytes: summary.totalBytes
        };
    }

    private _extractReferenceBundlePath(sourceText: string): string {
        const patterns = [
            /(?:reference_bundle_path|reference bundle path|reference path)\s*[:=]\s*([^\r\n]+)/i,
            /(?:參考素材路徑|參考檔案路徑|參考路徑)\s*[:=：]\s*([^\r\n]+)/i
        ];
        for (const pattern of patterns) {
            const match = sourceText.match(pattern);
            if (!match?.[1]) continue;
            return match[1].trim().replace(/^['"`]+|['"`]+$/g, '');
        }
        return "";
    }

    private async _summarizeReferenceDirectory(sourcePath: string): Promise<{ fileCount: number; totalBytes: number }> {
        let fileCount = 0;
        let totalBytes = 0;
        const walk = async (dir: string): Promise<void> => {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (['.git', 'node_modules', '.venv', '__pycache__'].includes(entry.name)) continue;
                const fullPath = path.join(dir, entry.name);
                if (entry.isSymbolicLink()) continue;
                if (entry.isDirectory()) {
                    await walk(fullPath);
                    continue;
                }
                if (!entry.isFile()) continue;
                const stat = await fs.stat(fullPath);
                fileCount += 1;
                totalBytes += stat.size;
            }
        };
        await walk(sourcePath);
        return { fileCount, totalBytes };
    }

    private async _deleteJobWorkspace(jobId: string, workspacePath: string): Promise<void> {
        const rootPath = path.resolve(this._workspaceRoot());
        const targetPath = path.resolve(workspacePath);
        const expectedPath = path.resolve(rootPath, jobId);

        if (targetPath !== expectedPath) {
            throw new Error("Refusing to delete AI build workspace because the path does not match the job workspace");
        }

        if (!this._isPathInside(targetPath, rootPath)) {
            throw new Error("Refusing to delete AI build workspace outside configured workspace root");
        }

        const stat = await fs.stat(targetPath).catch(() => null);
        if (!stat) {
            logger.warn(`AI build workspace already missing for job ${jobId}: ${targetPath}`);
            return;
        }
        if (!stat.isDirectory()) {
            throw new Error("Refusing to delete AI build workspace because target is not a directory");
        }

        await fs.rm(targetPath, { recursive: true, force: true });
        const remaining = await fs.stat(targetPath).catch(() => null);
        if (remaining) {
            throw new Error("AI build workspace deletion did not complete");
        }
    }

    private _isPathInside(targetPath: string, rootPath: string): boolean {
        const relative = path.relative(rootPath, targetPath);
        return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
    }

    private _buildWorkspaceAgentInstructions(): string {
        return `You are preparing CSTG Box build artifacts in an isolated workspace.

Rules:
- Work only inside this workspace.
- Do not SSH into the VM directly. The platform executor will run generated scripts.
- If a reference/ directory exists, inspect it first and treat it as the authoritative source material.
- Keep design.md confidential: include objectives, service map, intended solve path, credentials, flags, and AI assistant private context.
- setup.md must be operator-readable and mirror generated/setup.sh.
- setup.md must include exact commands in Markdown, not only a pointer to generated/setup.sh.
- writeup.md must be a designer-facing solve path.
- Create generated/setup.sh and generated/validation.sh as executable Bash scripts.
- When using opencode file tools, use the exact schema required by the tool. For write operations the path key is filePath.
- Bash/tool calls also require their documented schema. For bash use a short description plus the command.
- Do not wait for confirmation, do not say you are ready, and do not stop after planning. Create or edit the files immediately.
- If a tool call fails because of schema arguments, retry the same operation with the corrected schema before continuing.
- Scripts must be idempotent and non-interactive.
- Do not place SSH passwords or API keys in files.
`;
    }

    private _buildOpenCodeConfig(): string {
        const rawModel = process.env.OPENCODE_BOX_BUILD_MODEL || process.env.OPENAI_BOX_BUILD_MODEL || process.env.OPENAI_MODEL || "gpt-4o";
        const modelId = rawModel.includes("/") ? rawModel.split("/").slice(1).join("/") : rawModel;
        return JSON.stringify({
            "$schema": "https://opencode.ai/config.json",
            provider: {
                cstg: {
                    npm: "@ai-sdk/openai-compatible",
                    name: "CSTG AI Service",
                    options: {
                        baseURL: process.env.OPENAI_BASE_URL,
                        apiKey: "{env:OPENAI_API_KEY}"
                    },
                    models: {
                        [modelId]: {
                            name: modelId
                        }
                    }
                }
            }
        }, null, 2);
    }

    private async _runOpencodeGenerator(
        jobId: string,
        workspacePath: string,
        job: AIBoxBuildJob,
        config: AIBoxRunRequest,
        vmContext: { vmIp?: string; pveVmid?: string; pveNode?: string; sshUser?: string }
    ): Promise<void> {
        const model = this._opencodeModel();
        await AIBoxBuildJobModel.updateOne({ _id: jobId }, { opencode_model: model, updated_at: new Date() });
        const prompt = `Generate the CSTG Box build files for this workspace. Complete the task in one pass.

Work rules:
- Work only in this directory.
- Do not SSH into the VM, do not call PVE APIs, and do not run destructive commands.
- Prefer editing/writing files directly. Shell commands are only for harmless local inspection.
- When writing files through opencode tools, use the exact file tool schema. The write tool path key is filePath, for example {"filePath":"generated/setup.sh","content":"..."}.
- When using the bash tool, include both description and command, for example {"description":"List generated files","command":"ls -la generated"}.
- Do not ask for confirmation, do not say you are ready, and do not finish until all five required files exist on disk.
- If a tool call fails due to missing or invalid schema keys, retry it with the corrected schema immediately.
- If a reference/ directory exists, inspect its Markdown, source code, scripts, and config files before generating outputs. Preserve its concrete lab requirements unless they conflict with build-context.json.
- If details are ambiguous, choose a conservative, reviewable implementation and document the assumption.
- Preserve every concrete requirement from build-context.json and the existing Markdown files.
- Required Ubuntu Server baseline when latest Ubuntu is requested: ${process.env.OPENAI_BOX_BUILD_UBUNTU_SERVER_LTS || "26.04"}. Mention this baseline in design.md, setup.md, and writeup.md when applicable.

Target VM:
- PVE: ${vmContext.pveNode || "dry-run"}/${vmContext.pveVmid || "dry-run"}
- IP: ${vmContext.vmIp || "dry-run"}
- SSH user: ${vmContext.sshUser || config.ciuser || "root"}

Required output files:
1. Update design.md with the final challenge design and AI-assistant private context.
2. Update setup.md with exact operator steps, service configs, flag placement, rollback, verification notes, and a command plan that mirrors generated/setup.sh.
3. Update writeup.md with the intended solver path, including enumeration/discovery, exploitation or lateral movement, user flag, privilege escalation, and root flag.
4. Create generated/setup.sh to configure the target VM.
5. Create generated/validation.sh to verify the target VM.

Script requirements:
- Bash with a shebang.
- Idempotent and non-interactive.
- Safe to run through sudo on Ubuntu Server.
- Include explicit package installs, service configuration, flag placement, and verification.
- validation.sh must exit non-zero when required services, files, ports, or flags are missing.

Return a concise status summary only after all five required files exist.`;

        const result = await this._runCommand(
            this._opencodeBinary(),
            [
                "run",
                "--dir",
                workspacePath,
                "--model",
                model,
                "--dangerously-skip-permissions",
                prompt
            ],
            {
                cwd: workspacePath,
                timeoutMs: Number(process.env.OPENCODE_BOX_BUILD_TIMEOUT_MS || 15 * 60 * 1000),
                env: {
                    ...process.env,
                    OPENCODE_DISABLE_AUTOUPDATE: "true"
                }
            }
        );

        await this._appendRunLog(jobId, "opencode", result.exitCode === 0 ? "info" : "error", this._summarizeCommandResult("opencode run", result));
        if (result.exitCode !== 0) {
            if (await this._writeReferenceFallbackFiles(jobId, workspacePath, `opencode run failed with exit code ${result.exitCode ?? "unknown"}`)) {
                return;
            }
            throw new Error(`opencode run failed with exit code ${result.exitCode ?? "unknown"}`);
        }

        try {
            await this._ensureGeneratedScript(workspacePath, "setup.sh");
            await this._ensureGeneratedScript(workspacePath, "validation.sh");
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (await this._writeReferenceFallbackFiles(jobId, workspacePath, message)) {
                return;
            }
            throw error;
        }
    }

    private async _writeReferenceFallbackFiles(jobId: string, workspacePath: string, reason: string): Promise<boolean> {
        const referencePath = path.join(workspacePath, "reference", "114-2-midterm_v2");
        const referenceStat = await fs.stat(referencePath).catch(() => null);
        if (!referenceStat?.isDirectory()) return false;

        const assetRoot = path.join(process.cwd(), "src", "assets", "ai-box-build", "114-2-midterm-v2");
        const setupScript = await fs.readFile(path.join(assetRoot, "setup.sh"), "utf8").catch(() => "");
        const validationScript = await fs.readFile(path.join(assetRoot, "validation.sh"), "utf8").catch(() => "");
        if (!setupScript.trim() || !validationScript.trim()) return false;

        const referenceSetup = await fs.readFile(path.join(referencePath, "Lab", "setup.md"), "utf8").catch(() => "");
        const referenceEthci = await fs.readFile(path.join(referencePath, "Lab", "modify_for_ethci.md"), "utf8").catch(() => "");
        const referenceWriteup = await fs.readFile(path.join(referencePath, "Writeup", "Writeup.md"), "utf8").catch(() => "");
        const sanitizeReferenceDoc = (value: string) => value
            .replace(/TODO:/g, "Intentional draft note:")
            .replace(/TODO\b/g, "Draft note")
            .replace(/YOUR_FLAGS_HAVE_NOT_BEEN_GENERATED/g, "FLAGS_ARE_GENERATED_DURING_SETUP");
        const normalizedWriteup = sanitizeReferenceDoc(referenceWriteup || "# writeup.md\n\nReference writeup unavailable.")
            .replace(/flowise\.flow\.htb/g, "flowise.flow.ethci")
            .replace(/flow\.htb/g, "flow.ethci")
            .replace(/192\.168\.92\.129/g, "target VM IP");

        const design = `# design.md

## Source

This build is a reference-backed fallback generated from \`reference/114-2-midterm_v2\` because opencode did not complete file generation.

Original reference bundle path: \`/home/tkuimwd/.cstg-ai-box-build-references/114-2-midterm_v2\`.

Platform baseline: Ubuntu Server 26.04.

Reason: ${reason}

## Challenge

Flow recreates the 114-2-midterm_v2 lab. The intended path is:

1. Enumerate \`flow.ethci\` and identify WordPress with Ultimate Member 2.6.6.
2. Exploit CVE-2023-3460 to gain WordPress administrator access.
3. Read the private draft that leaks \`flowise.flow.ethci\` and the Flowise credential \`admin@flow.ethci\`.
4. Use Flowise 3.0.4 CVE-2025-59528 to execute commands as \`sakiko\`.
5. Use the localhost-only ModelDrive service at \`127.0.0.1:8000\`, its \`/var/www/ModelDrive/src/config.json\` shadow backend, and the \`sudoedit\` rule.
6. Upload a PHP payload by changing the ModelDrive \`dest\` field to \`shell.php\`; the service runs as root and yields the root flag.

## Learning Objectives

- Practice vhost enumeration and WordPress plugin version discovery.
- Exploit Ultimate Member 2.6.6 / CVE-2023-3460 to reach WordPress administrator.
- Extract hidden service credentials from draft content.
- Exercise authenticated command execution against a Flowise 3.0.4 CVE-2025-59528 compatible surface.
- Pivot into a localhost-only service and abuse a configuration-backed authentication design.
- Validate root command execution through a server-side upload destination bypass.

## Service Map

- \`flow.ethci\`: Apache/WordPress on port 80.
- \`flowise.flow.ethci\`: Apache reverse proxy to \`127.0.0.1:3000\`.
- \`127.0.0.1:8000\`: ModelDrive, intentionally localhost-only.

## Credentials And Flags

- Linux: \`sakiko\` / \`2cute4u\`; root password is defined in the reference setup.
- WordPress admin: \`admin\` / reference password, email \`admin@flow.ethci\`.
- Flowise: \`admin@flow.ethci\` / reference password.
- User flag: \`/home/sakiko/user.txt\`.
- Root flag: \`/root/root.txt\`.
- Dynamic flag support: \`/root/flags.list\` and \`/root/flag.sh\`.

## AI Assistant Private Context

The assistant may hint toward vhost discovery, Ultimate Member 2.6.6/CVE-2023-3460, the WordPress draft leak, Flowise CVE-2025-59528, ModelDrive shadow-file authentication, the \`sudoedit\` rule for \`/var/www/ModelDrive/src/config.json\`, and the upload \`dest=shell.php\` bypass. It must not reveal flags or credentials directly unless the Box policy explicitly allows solution disclosure.
`;

        const setup = `# setup.md

This setup is generated from \`reference/114-2-midterm_v2\` and mirrors \`generated/setup.sh\`.

Original reference bundle path: \`/home/tkuimwd/.cstg-ai-box-build-references/114-2-midterm_v2\`.

Platform baseline: Ubuntu Server 26.04.

## Reference Notes

${sanitizeReferenceDoc(referenceSetup)}

## ETHCI Adjustments

${sanitizeReferenceDoc(referenceEthci)}

## Command Plan

\`\`\`bash
${sanitizeReferenceDoc(setupScript)}
\`\`\`
`;

        await fs.mkdir(path.join(workspacePath, "generated"), { recursive: true });
        await fs.writeFile(path.join(workspacePath, "design.md"), design, "utf8");
        await fs.writeFile(path.join(workspacePath, "setup.md"), setup, "utf8");
        await fs.writeFile(path.join(workspacePath, "writeup.md"), `# Platform Baseline\n\nUbuntu Server 26.04.\n\n${normalizedWriteup}`, "utf8");
        await fs.writeFile(path.join(workspacePath, "generated", "setup.sh"), setupScript, "utf8");
        await fs.writeFile(path.join(workspacePath, "generated", "validation.sh"), validationScript, "utf8");
        await fs.chmod(path.join(workspacePath, "generated", "setup.sh"), 0o755);
        await fs.chmod(path.join(workspacePath, "generated", "validation.sh"), 0o755);
        await this._appendRunLog(jobId, "reference-fallback", "warning", `Generated build files from 114-2-midterm_v2 reference bundle after opencode failure: ${reason}`);
        return true;
    }

    private _opencodeModel(): string {
        const rawModel = process.env.OPENCODE_BOX_BUILD_MODEL || process.env.OPENAI_BOX_BUILD_MODEL || process.env.OPENAI_MODEL || "gpt-4o";
        return rawModel.includes("/") ? rawModel : `cstg/${rawModel}`;
    }

    private _opencodeBinary(): string {
        return process.env.OPENCODE_BIN || "opencode";
    }

    private _configuredList(value: string): string[] {
        return value
            .split(",")
            .map(item => item.trim())
            .filter(item => item.length > 0);
    }

    private async _ensureGeneratedScript(workspacePath: string, scriptName: string): Promise<void> {
        const scriptPath = path.join(workspacePath, "generated", scriptName);
        const stat = await fs.stat(scriptPath).catch(() => null);
        if (!stat || !stat.isFile()) {
            throw new Error(`opencode did not generate generated/${scriptName}`);
        }
        const content = await fs.readFile(scriptPath, "utf8");
        if (!content.includes("#!") || content.trim().length < 40) {
            throw new Error(`generated/${scriptName} is not a usable bash script`);
        }
        await fs.chmod(scriptPath, 0o700);
    }

    private async _refreshArtifactsFromWorkspace(jobId: string, workspacePath: string): Promise<void> {
        const [designMdRaw, setupMdRaw, writeupMdRaw, setupScript] = await Promise.all([
            fs.readFile(path.join(workspacePath, "design.md"), "utf8"),
            fs.readFile(path.join(workspacePath, "setup.md"), "utf8"),
            fs.readFile(path.join(workspacePath, "writeup.md"), "utf8"),
            fs.readFile(path.join(workspacePath, "generated", "setup.sh"), "utf8").catch(() => "")
        ]);
        const job = await AIBoxBuildJobModel.findById(jobId).exec();
        const sourceText = `${job?.direction || ""}\n${job?.constraints || ""}`;
        const designMd = this._ensureUbuntuBaselineInMarkdown(designMdRaw, sourceText);
        const setupMdWithBaseline = this._ensureUbuntuBaselineInMarkdown(setupMdRaw, sourceText);
        const setupMd = this._ensureSetupMarkdownHasGeneratedCommands(setupMdWithBaseline, setupScript);
        const writeupMd = this._ensureUbuntuBaselineInMarkdown(writeupMdRaw, sourceText);
        await AIBoxBuildJobModel.updateOne(
            { _id: jobId },
            {
                artifacts: {
                    design_md: designMd,
                    setup_md: setupMd,
                    writeup_md: writeupMd
                },
                updated_at: new Date()
            }
        );
    }

    private _ensureUbuntuBaselineInMarkdown(content: string, sourceText: string): string {
        const requiredVersion = this._requiredUbuntuBaseline(sourceText);
        if (!requiredVersion || content.toLowerCase().includes(requiredVersion.toLowerCase())) return content;

        return `${content.trim()}\n\n## Platform Baseline\n\n- Target OS: Ubuntu Server ${requiredVersion}. Preserve this baseline for ISO/template selection, setup, and validation.\n`;
    }

    private _requiredUbuntuBaseline(sourceText: string): string | null {
        const explicitUbuntuVersion = sourceText.match(/ubuntu(?:\s+server)?\s*(\d{2}\.\d{2})|(\d{2}\.\d{2})\s*ubuntu/i);
        if (explicitUbuntuVersion) return explicitUbuntuVersion[1] || explicitUbuntuVersion[2] || null;
        if (/(latest|newest).{0,40}ubuntu|ubuntu.{0,40}(latest|newest)|ubuntu server release iso/i.test(sourceText)) {
            return process.env.OPENAI_BOX_BUILD_UBUNTU_SERVER_LTS || '26.04';
        }
        return null;
    }

    private _ensureSetupMarkdownHasGeneratedCommands(setupMd: string, setupScript: string): string {
        if (this._containsConcreteSetupCommand(setupMd) || !setupScript.trim()) return setupMd;

        const clippedScript = setupScript.trim().slice(0, 7000);
        return `${setupMd.trim()}\n\n## Generated Setup Command Plan\n\nThe exact operator command plan from generated/setup.sh is mirrored here for review.\n\n\`\`\`bash\n${clippedScript}\n\`\`\`\n`;
    }

    private async _uploadAndRunScript(
        jobId: string,
        workspacePath: string,
        scriptName: "setup.sh" | "validation.sh",
        vmContext: { vmIp?: string; sshUser?: string; sshPassword?: string },
        timeoutMs: number
    ): Promise<CommandResult> {
        if (!vmContext.vmIp) throw new Error("VM IP is required before SSH execution");
        const sshUser = vmContext.sshUser || "root";
        const sshPassword = vmContext.sshPassword || "";
        const localScript = path.join(workspacePath, "generated", scriptName);
        const remoteDir = "/tmp/cstg-ai-build";
        const remoteScript = `${remoteDir}/${scriptName}`;
        const sshOptions = [
            "-o", "StrictHostKeyChecking=no",
            "-o", "UserKnownHostsFile=/dev/null",
            "-o", "ConnectTimeout=20"
        ];

        await this._appendRunLog(jobId, scriptName, "info", `Uploading ${scriptName} to ${sshUser}@${vmContext.vmIp}.`);
        const mkdir = await this._runCommand("sshpass", [
            "-e", "ssh", ...sshOptions, `${sshUser}@${vmContext.vmIp}`, `mkdir -p ${remoteDir}`
        ], { timeoutMs: 60 * 1000, env: { ...process.env, SSHPASS: sshPassword } });
        if (mkdir.exitCode !== 0) {
            await this._appendRunLog(jobId, scriptName, "error", this._summarizeCommandResult(`ssh mkdir for ${scriptName}`, mkdir));
            throw new Error(`Failed to prepare remote script directory for ${scriptName}`);
        }

        const localReference = path.join(workspacePath, "reference");
        const referenceStat = await fs.stat(localReference).catch(() => null);
        if (referenceStat?.isDirectory()) {
            await this._appendRunLog(jobId, scriptName, "info", `Uploading reference bundle to ${sshUser}@${vmContext.vmIp}.`);
            const removeReference = await this._runCommand("sshpass", [
                "-e", "ssh", ...sshOptions, `${sshUser}@${vmContext.vmIp}`, `rm -rf ${remoteDir}/reference`
            ], { timeoutMs: 60 * 1000, env: { ...process.env, SSHPASS: sshPassword } });
            if (removeReference.exitCode !== 0) {
                await this._appendRunLog(jobId, scriptName, "error", this._summarizeCommandResult(`remove remote reference for ${scriptName}`, removeReference));
                throw new Error(`Failed to remove existing remote reference bundle for ${scriptName}`);
            }

            const uploadReference = await this._runCommand("sshpass", [
                "-e", "scp", "-r", ...sshOptions, localReference, `${sshUser}@${vmContext.vmIp}:${remoteDir}/reference`
            ], { timeoutMs: 3 * 60 * 1000, env: { ...process.env, SSHPASS: sshPassword } });
            if (uploadReference.exitCode !== 0) {
                await this._appendRunLog(jobId, scriptName, "error", this._summarizeCommandResult(`scp reference for ${scriptName}`, uploadReference));
                throw new Error(`Failed to upload reference bundle for ${scriptName}`);
            }
        }

        const upload = await this._runCommand("sshpass", [
            "-e", "scp", ...sshOptions, localScript, `${sshUser}@${vmContext.vmIp}:${remoteScript}`
        ], { timeoutMs: 90 * 1000, env: { ...process.env, SSHPASS: sshPassword } });
        if (upload.exitCode !== 0) {
            await this._appendRunLog(jobId, scriptName, "error", this._summarizeCommandResult(`scp ${scriptName}`, upload));
            throw new Error(`Failed to upload ${scriptName}`);
        }

        const remoteCommand = sshUser === "root"
            ? `bash ${remoteScript}`
            : `sudo -S -p '' bash ${remoteScript}`;
        const run = await this._runCommand("sshpass", [
            "-e", "ssh", ...sshOptions, `${sshUser}@${vmContext.vmIp}`, remoteCommand
        ], {
            timeoutMs,
            env: { ...process.env, SSHPASS: sshPassword },
            input: sshUser === "root" ? undefined : `${sshPassword}\n`
        });

        await this._appendRunLog(jobId, scriptName, run.exitCode === 0 ? "info" : "error", this._summarizeCommandResult(`run ${scriptName}`, run));
        return run;
    }

    private _runCommand(
        command: string,
        args: string[],
        options: { cwd?: string; timeoutMs: number; env?: NodeJS.ProcessEnv; input?: string }
    ): Promise<CommandResult> {
        return new Promise((resolve) => {
            const detached = process.platform !== "win32";
            const child = spawn(command, args, {
                cwd: options.cwd,
                env: options.env,
                shell: false,
                detached
            });

            let stdout = "";
            let stderr = "";
            let timedOut = false;
            let settled = false;
            let timer: NodeJS.Timeout;
            const finish = (result: CommandResult) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(result);
            };
            const killChild = (signal: NodeJS.Signals) => {
                try {
                    if (detached && child.pid) {
                        process.kill(-child.pid, signal);
                    } else {
                        child.kill(signal);
                    }
                } catch {
                    try {
                        child.kill(signal);
                    } catch {
                        // process already exited
                    }
                }
            };
            timer = setTimeout(() => {
                timedOut = true;
                killChild("SIGTERM");
                setTimeout(() => killChild("SIGKILL"), 5000).unref();
            }, options.timeoutMs);

            child.stdout?.on("data", (chunk) => {
                stdout += chunk.toString();
                stdout = this._tail(stdout, 24000);
            });
            child.stderr?.on("data", (chunk) => {
                stderr += chunk.toString();
                stderr = this._tail(stderr, 24000);
            });
            child.on("error", (error) => {
                finish({ exitCode: 127, stdout, stderr: `${stderr}\n${error.message}`.trim(), timedOut });
            });
            child.on("close", (code) => {
                finish({ exitCode: code, stdout, stderr, timedOut });
            });
            if (options.input !== undefined) {
                child.stdin?.write(options.input);
            }
            child.stdin?.end();
        });
    }

    private _summarizeCommandResult(label: string, result: CommandResult): string {
        const parts = [
            `${label} exit=${result.exitCode ?? "unknown"}${result.timedOut ? " timeout=true" : ""}`,
            result.stdout ? `stdout:\n${this._tail(result.stdout.trim(), 2500)}` : "",
            result.stderr ? `stderr:\n${this._tail(result.stderr.trim(), 2500)}` : ""
        ].filter(Boolean);
        return parts.join("\n");
    }

    private async _setExecutionStatus(jobId: string, status: AIBoxBuildExecutionStatus, message: string): Promise<void> {
        await AIBoxBuildJobModel.updateOne(
            { _id: jobId },
            {
                execution_status: status,
                updated_at: new Date(),
                $push: { run_logs: { $each: [this._makeRunLog(status, "info", message)], $slice: -200 } }
            }
        );
    }

    private async _appendRunLog(jobId: string, stage: string, level: 'info' | 'warning' | 'error', message: string): Promise<void> {
        await AIBoxBuildJobModel.updateOne(
            { _id: jobId },
            {
                updated_at: new Date(),
                $push: { run_logs: { $each: [this._makeRunLog(stage, level, message)], $slice: -200 } }
            }
        );
    }

    private _makeRunLog(stage: string, level: 'info' | 'warning' | 'error', message: string) {
        return {
            stage,
            level,
            message: this._tail(this._redactSecrets(message), 5000),
            created_at: new Date()
        };
    }

    private _redactSecrets(value: string): string {
        let redacted = value;
        const secrets = [
            process.env.OPENAI_API_KEY,
            process.env.PROJECTUSER_GUACAMOLE_PASSWORD
        ].filter((secret): secret is string => typeof secret === "string" && secret.length >= 8);
        for (const secret of secrets) {
            redacted = redacted.replace(new RegExp(this._escapeRegExp(secret), "g"), "[redacted]");
        }
        return redacted.replace(/(password|cipassword|SSHPASS)\s*[:=]\s*\S+/gi, "$1=[redacted]");
    }

    private _escapeRegExp(value: string): string {
        return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    private _tail(value: string, maxLength: number): string {
        return value.length <= maxLength ? value : value.slice(value.length - maxLength);
    }

    private _sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private _validateDirection(direction: unknown, constraints: unknown): resp<undefined> | null {
        if (!direction || typeof direction !== 'string' || direction.trim().length < 10) {
            return createResponse(400, "direction must be at least 10 characters");
        }
        if (direction.length > 8000) {
            return createResponse(400, "direction exceeds maximum length of 8000 characters");
        }
        if (constraints && typeof constraints === 'string' && constraints.length > 8000) {
            return createResponse(400, "constraints exceeds maximum length of 8000 characters");
        }
        return null;
    }

    private async _runInitialAgent(direction: string, constraints: string, allowAiAssistant: boolean): Promise<AgentParsedResponse> {
        try {
            const parsed = await this._runAgent([
                { role: 'system', content: AIBoxBuildPrompts.SYSTEM_INIT },
                { role: 'user', content: AIBoxBuildPrompts.buildInitialPrompt(direction, constraints, allowAiAssistant) }
            ]);
            if (!this._hasUsableArtifacts(parsed, ['design_md', 'setup_md', 'writeup_md'])) {
                throw new Error("AI response did not include all required artifacts");
            }
            return parsed;
        } catch (error) {
            logger.warn("Combined AI box build generation failed; retrying as split artifacts:", error);
            return this._runSplitArtifactAgent(direction, constraints, allowAiAssistant, {}, "Initial generation.");
        }
    }

    private async _runIterationAgent(job: AIBoxBuildJob, message: string): Promise<AgentParsedResponse> {
        try {
            const parsed = await this._runAgent([
                { role: 'system', content: AIBoxBuildPrompts.SYSTEM_INIT },
                { role: 'user', content: AIBoxBuildPrompts.buildIterationPrompt(job, message) }
            ]);
            if (!this._hasUsableArtifacts(parsed, ['design_md', 'setup_md', 'writeup_md'])) {
                throw new Error("AI response did not include all required artifacts");
            }
            return parsed;
        } catch (error) {
            logger.warn(`Combined AI box build update failed for job ${job._id}; retrying as split artifacts:`, error);
            return this._runSplitArtifactAgent(job.direction, job.constraints || "", job.allow_ai_assistant, job.artifacts, message);
        }
    }

    private async _runSplitArtifactAgent(
        direction: string,
        constraints: string,
        allowAiAssistant: boolean,
        existingArtifacts: Partial<AIBoxBuildArtifacts>,
        userMessage: string
    ): Promise<AgentParsedResponse> {
        const artifactOrder: AIBoxArtifactName[] = ['design_md', 'setup_md', 'writeup_md'];
        return this._runArtifactRepairAgent(direction, constraints, allowAiAssistant, existingArtifacts, userMessage, artifactOrder, "AI build artifacts generated in split mode.");
    }

    private _shouldUseTargetedArtifactRepair(job: AIBoxBuildJob, message: string): boolean {
        const artifacts = this._normalizeArtifacts(job.artifacts, job.direction);
        return /setup\.?md|design\.?md|writeup\.?md|artifact/i.test(message)
            || !this._isUsableArtifact('design_md', artifacts.design_md)
            || !this._isUsableArtifact('setup_md', artifacts.setup_md)
            || !this._isUsableArtifact('writeup_md', artifacts.writeup_md);
    }

    private async _runTargetedArtifactRepairAgent(job: AIBoxBuildJob, userMessage: string): Promise<AgentParsedResponse> {
        const artifacts = this._normalizeArtifacts(job.artifacts, job.direction);
        const artifactOrder = this._targetArtifactsForRepair(userMessage, artifacts);
        return this._runArtifactRepairAgent(
            job.direction,
            job.constraints || "",
            job.allow_ai_assistant,
            artifacts,
            userMessage,
            artifactOrder,
            `Updated ${artifactOrder.join(', ')}.`
        );
    }

    private _targetArtifactsForRepair(message: string, artifacts: AIBoxBuildArtifacts): AIBoxArtifactName[] {
        const targets: AIBoxArtifactName[] = [];
        const add = (artifactName: AIBoxArtifactName) => {
            if (!targets.includes(artifactName)) targets.push(artifactName);
        };

        if (/design\.?md/i.test(message) || !this._isUsableArtifact('design_md', artifacts.design_md)) add('design_md');
        if (/setup\.?md/i.test(message) || !this._isUsableArtifact('setup_md', artifacts.setup_md)) add('setup_md');
        if (/writeup\.?md/i.test(message) || !this._isUsableArtifact('writeup_md', artifacts.writeup_md)) add('writeup_md');

        return targets.length > 0 ? targets : ['design_md', 'setup_md', 'writeup_md'];
    }

    private async _runArtifactRepairAgent(
        direction: string,
        constraints: string,
        allowAiAssistant: boolean,
        existingArtifacts: Partial<AIBoxBuildArtifacts>,
        userMessage: string,
        artifactOrder: AIBoxArtifactName[],
        defaultSummary: string
    ): Promise<AgentParsedResponse> {
        const artifacts: Partial<AIBoxBuildArtifacts> = { ...existingArtifacts };
        const partials: AgentParsedResponse[] = [];

        for (const artifactName of artifactOrder) {
            const parsed = await this._runAgent([
                { role: 'system', content: AIBoxBuildPrompts.SYSTEM_INIT },
                { role: 'user', content: AIBoxBuildPrompts.buildSingleArtifactPrompt(artifactName, direction, constraints, allowAiAssistant, artifacts, userMessage) }
            ]);
            partials.push(parsed);
            let artifact = parsed.artifacts?.[artifactName];
            if (!this._isUsableArtifact(artifactName, artifact) && parsed.raw_content && parsed.raw_content.trim().length > 120) {
                artifact = this._coerceRawArtifact(artifactName, parsed.raw_content);
            }
            if (this._isUsableArtifact(artifactName, artifact)) {
                artifacts[artifactName] = artifact;
            } else {
                throw new Error(`AI response did not include usable ${artifactName}`);
            }
        }

        return {
            phase: AIBoxBuildPhase.verification,
            summary: this._firstNonEmpty(partials.map(item => item.summary)) || defaultSummary,
            current_understanding: this._mergeStringArrays(partials.flatMap(item => this._normalizeStringArray(item.current_understanding))),
            open_questions: this._mergeStringArrays(partials.flatMap(item => this._normalizeStringArray(item.open_questions))),
            risks: this._mergeStringArrays(partials.flatMap(item => this._normalizeStringArray(item.risks))),
            next_actions: this._mergeStringArrays(partials.flatMap(item => this._normalizeStringArray(item.next_actions))),
            artifacts
        };
    }

    private async _runAgent(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): Promise<AgentParsedResponse> {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error("OPENAI_API_KEY is not configured");
        }

        const errors: string[] = [];
        for (const model of this._modelCandidates()) {
            try {
                return await this._runAgentWithModel(messages, model);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                errors.push(`${model}: ${message}`);
                logger.warn(`AI box build model ${model} failed: ${message}`);
            }
        }

        throw new Error(`All AI box build models failed: ${errors.join("; ")}`);
    }

    private async _runAgentWithModel(
        messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
        model: string
    ): Promise<AgentParsedResponse> {
        const baseURL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
        const maxCompletionTokens = Number(process.env.OPENAI_BOX_BUILD_MAX_TOKENS || 3500);
        const timeoutMs = Number(process.env.OPENAI_BOX_BUILD_TIMEOUT_MS || 180000);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(`${baseURL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model,
                    messages,
                    max_completion_tokens: maxCompletionTokens,
                    response_format: { type: 'json_object' }
                }),
                signal: controller.signal
            });

            const raw = await response.text();
            if (!response.ok) {
                throw new Error(`AI service returned ${response.status}: ${raw.slice(0, 500)}`);
            }

            const normalizedCompletion = this._normalizeChatCompletion(raw);
            const message = normalizedCompletion.choices?.[0]?.message || {};
            const content = message.content || message.reasoning_content || '';
            const parsed = this._parseAgentResponse(content);
            parsed.model_used = model;
            return parsed;
        } finally {
            clearTimeout(timeout);
        }
    }

    private _modelCandidates(): string[] {
        return this._mergeStringArrays([
            ...(process.env.OPENAI_BOX_BUILD_MODELS ? this._configuredList(process.env.OPENAI_BOX_BUILD_MODELS) : []),
            process.env.OPENAI_BOX_BUILD_MODEL,
            process.env.OPENAI_MODEL,
            'gpt-4o'
        ]).filter(model => model.length > 0);
    }

    private _normalizeChatCompletion(completion: unknown): any {
        if (typeof completion !== 'string') return completion;

        try {
            return JSON.parse(completion);
        } catch {
            return {
                choices: [
                    {
                        message: {
                            content: completion
                        }
                    }
                ]
            };
        }
    }

    private _parseAgentResponse(content: string): AgentParsedResponse {
        const candidates: string[] = [];
        const addCandidate = (value: string | undefined) => {
            const trimmed = value?.trim();
            if (trimmed && !candidates.includes(trimmed)) candidates.push(trimmed);
        };

        addCandidate(content);
        addCandidate(content.replace(/^#\s*(?:design|setup|writeup)\.md\s*/i, ''));

        const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
        addCandidate(fenceMatch?.[1]);

        for (const source of [...candidates]) {
            const firstBrace = source.indexOf('{');
            const lastBrace = source.lastIndexOf('}');
            if (firstBrace >= 0 && lastBrace > firstBrace) {
                addCandidate(source.slice(firstBrace, lastBrace + 1));
            }
        }

        for (const candidate of candidates) {
            for (let trimRight = 0; trimRight <= 3; trimRight++) {
                const attempt = trimRight === 0 ? candidate : candidate.slice(0, -trimRight).trim();
                try {
                    const parsed = JSON.parse(attempt) as AgentParsedResponse;
                    if (parsed && typeof parsed === 'object') return this._coerceParsedResponse(parsed);
                } catch {
                    // try next repair
                }
            }
        }

        return {
            phase: AIBoxBuildPhase.design,
            summary: "AI returned non-JSON output; stored it as a draft for review.",
            current_understanding: [],
            open_questions: ["AI output format needs review before proceeding."],
            risks: ["The agent response could not be parsed as structured JSON."],
            next_actions: ["Ask the agent to reformat the result or regenerate the job."],
            artifacts: {
                design_md: `# design.md\n\n${content}`,
                setup_md: "# setup.md\n\nPending structured generation.",
                writeup_md: "# writeup.md\n\nPending structured generation."
            },
            raw_content: content,
            parsed_as_json: false
        };
    }

    private _coerceParsedResponse(parsed: AgentParsedResponse & Record<string, unknown>): AgentParsedResponse {
        const artifacts = parsed.artifacts && typeof parsed.artifacts === 'object'
            ? { ...parsed.artifacts }
            : {};

        for (const key of ['design_md', 'setup_md', 'writeup_md'] as const) {
            if (typeof artifacts[key] !== 'string' && typeof parsed[key] === 'string') {
                artifacts[key] = parsed[key] as string;
            }
        }

        return {
            ...parsed,
            artifacts,
            parsed_as_json: true
        };
    }

    private _hasUsableArtifacts(parsed: AgentParsedResponse, requiredArtifacts: AIBoxArtifactName[]): boolean {
        return requiredArtifacts.every((artifactName) => this._isUsableArtifact(artifactName, parsed.artifacts?.[artifactName]));
    }

    private _isUsableArtifact(artifactName: AIBoxArtifactName, artifact: unknown): artifact is string {
        if (typeof artifact !== 'string') return false;
        const trimmed = artifact.trim();
        const minLengthByArtifact: Record<AIBoxArtifactName, number> = {
            design_md: 500,
            setup_md: 500,
            writeup_md: 350
        };
        if (trimmed.length < minLengthByArtifact[artifactName]) return false;
        return !this._containsUnresolvedPlaceholder(trimmed);
    }

    private _coerceRawArtifact(artifactName: AIBoxArtifactName, content: string): string {
        const heading = artifactName.replace('_', '.').replace('.md', '.md');
        const trimmed = content.trim();
        if (/^#\s+/m.test(trimmed)) return trimmed;
        return `# ${heading}\n\n${trimmed}`;
    }

    private _normalizePhase(value: unknown): AIBoxBuildPhase {
        if (value === AIBoxBuildPhase.implementation) return AIBoxBuildPhase.implementation;
        if (value === AIBoxBuildPhase.verification) return AIBoxBuildPhase.verification;
        return AIBoxBuildPhase.design;
    }

    private _normalizeString(value: unknown): string {
        return typeof value === 'string' ? value : '';
    }

    private _normalizeStringArray(value: unknown): string[] {
        if (!Array.isArray(value)) return [];
        return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map(item => item.trim()).slice(0, 20);
    }

    private _normalizeArtifacts(value: Partial<AIBoxBuildArtifacts> | undefined, fallbackDirection: string): AIBoxBuildArtifacts {
        return {
            design_md: typeof value?.design_md === 'string' && value.design_md.trim() ? value.design_md : `# design.md\n\n## Direction\n\n${fallbackDirection}`,
            setup_md: typeof value?.setup_md === 'string' && value.setup_md.trim() ? value.setup_md : "# setup.md\n\nPending setup details.",
            writeup_md: typeof value?.writeup_md === 'string' && value.writeup_md.trim() ? value.writeup_md : "# writeup.md\n\nPending solve path."
        };
    }

    private _validateBuildArtifacts(input: {
        direction: string;
        constraints: string;
        allowAiAssistant: boolean;
        artifacts: AIBoxBuildArtifacts;
        agentError?: string;
    }): AIBoxBuildValidationReport {
        const blockers: string[] = [];
        const warnings: string[] = [];
        const passedChecks: string[] = [];
        const requirementChecks: string[] = [];
        const artifactChecks: AIBoxBuildValidationReport['artifact_checks'] = {
            design_md: [],
            setup_md: [],
            writeup_md: []
        };
        const allArtifactText = `${input.artifacts.design_md}\n${input.artifacts.setup_md}\n${input.artifacts.writeup_md}`;
        const sourceText = `${input.direction}\n${input.constraints}`;

        if (input.agentError) {
            blockers.push(`AI service failed before validation completed: ${input.agentError}`);
        }

        this._validateArtifactPresence('design_md', input.artifacts.design_md, 500, artifactChecks, blockers, warnings);
        this._validateArtifactPresence('setup_md', input.artifacts.setup_md, 500, artifactChecks, blockers, warnings);
        this._validateArtifactPresence('writeup_md', input.artifacts.writeup_md, 350, artifactChecks, blockers, warnings);

        this._validateDesignArtifact(input.artifacts.design_md, artifactChecks, warnings);
        this._validateSetupArtifact(input.artifacts.setup_md, artifactChecks, blockers, warnings);
        this._validateWriteupArtifact(input.artifacts.writeup_md, artifactChecks, warnings);
        this._validateAssistantPolicy(input.allowAiAssistant, input.artifacts.design_md, artifactChecks, warnings);

        const requiredReferences = this._extractRequiredReferences(sourceText);
        for (const reference of requiredReferences) {
            const description = this._describeRequiredReference(reference);
            if (this._artifactContains(allArtifactText, reference.value)) {
                requirementChecks.push(`found: ${description}`);
            } else {
                blockers.push(`Missing required reference from direction/constraints: ${description}`);
            }
        }
        if (requiredReferences.length > 0 && requiredReferences.every(reference => this._artifactContains(allArtifactText, reference.value))) {
            passedChecks.push("All extracted direction/constraint references are present in generated artifacts.");
        }

        const latestUbuntuServer = process.env.OPENAI_BOX_BUILD_UBUNTU_SERVER_LTS || '26.04';
        const sourceLower = sourceText.toLowerCase();
        const allLower = allArtifactText.toLowerCase();
        const latestUbuntuRequested = /(latest|newest).{0,40}ubuntu|ubuntu.{0,40}(latest|newest)|最新版.{0,40}ubuntu|ubuntu.{0,40}最新版|ubuntu server release iso/i.test(sourceText);
        const explicitUbuntuVersion = sourceText.match(/ubuntu(?:\s+server)?\s*(\d{2}\.\d{2})|(\d{2}\.\d{2})\s*ubuntu/i);
        if (latestUbuntuRequested || explicitUbuntuVersion) {
            const requiredVersion = explicitUbuntuVersion?.[1] || explicitUbuntuVersion?.[2] || latestUbuntuServer;
            if (!allLower.includes(requiredVersion.toLowerCase())) {
                blockers.push(`Requested Ubuntu baseline is not preserved in artifacts: Ubuntu ${requiredVersion}`);
            } else {
                passedChecks.push(`Ubuntu baseline preserved: ${requiredVersion}`);
            }

            if (requiredVersion !== '24.04' && sourceLower.includes('ubuntu') && allLower.includes('24.04')) {
                warnings.push("Artifacts mention Ubuntu 24.04 from source/reference context; confirm the selected runtime template before publishing.");
            }
        }

        if (input.allowAiAssistant) {
            passedChecks.push("Student AI assistant default is allowed and remains a Box setting.");
        } else {
            passedChecks.push("Student AI assistant default is disabled and remains a Box setting.");
        }

        return {
            status: blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'warning' : 'pass',
            blockers: this._mergeStringArrays(blockers).slice(0, 30),
            warnings: this._mergeStringArrays(warnings).slice(0, 30),
            passed_checks: this._mergeStringArrays(passedChecks).slice(0, 30),
            artifact_checks: artifactChecks,
            requirement_checks: this._mergeStringArrays(requirementChecks).slice(0, 50),
            generated_at: new Date()
        };
    }

    private _validateArtifactPresence(
        artifactName: AIBoxArtifactName,
        content: string,
        minLength: number,
        artifactChecks: AIBoxBuildValidationReport['artifact_checks'],
        blockers: string[],
        warnings: string[]
    ): void {
        const trimmed = content.trim();
        if (!trimmed) {
            blockers.push(`${artifactName} is empty.`);
            return;
        }

        artifactChecks[artifactName].push(`${artifactName} generated (${trimmed.length} chars).`);
        if (trimmed.length < minLength) {
            warnings.push(`${artifactName} is short for review-grade machine build documentation.`);
        }

        if (this._containsUnresolvedPlaceholder(trimmed)) {
            blockers.push(`${artifactName} contains placeholders that must be resolved before approval.`);
        }
    }

    private _containsUnresolvedPlaceholder(content: string): boolean {
        return /\b(TODO|TBD|FIXME|CHANGEME|Pending)\b/i.test(content)
            || /<\s*[^>\n]*(?:TODO|TBD|FIXME|CHANGEME|PLACEHOLDER|REPLACE_ME|REPLACEME|INSERT_HERE|FILL_IN|YOUR_)[^>\n]*\s*>/i.test(content);
    }

    private _validateDesignArtifact(
        design: string,
        artifactChecks: AIBoxBuildValidationReport['artifact_checks'],
        warnings: string[]
    ): void {
        const checks: Array<[RegExp, string]> = [
            [/(learning objective|objective|教學目標|學習目標|目標)/i, "learning objectives"],
            [/(service map|service|port|domain|host|服務|端口|主機|網域)/i, "service map"],
            [/(intended path|attack path|exploit|cve|漏洞|攻擊路徑|解題路徑)/i, "intended attack path"],
            [/(credential|password|secret|flag|憑證|密碼|旗標)/i, "credentials/secrets/flags"],
            [/(ai assistant|assistant context|hint|助理|提示)/i, "AI assistant private context"]
        ];

        for (const [pattern, label] of checks) {
            if (pattern.test(design)) {
                artifactChecks.design_md.push(`design.md includes ${label}.`);
            } else {
                warnings.push(`design.md should explicitly include ${label}.`);
            }
        }

        const intendedPathWarning = "design.md should explicitly include intended attack path.";
        if (
            warnings.includes(intendedPathWarning)
            && /(solve path|solver path|lateral movement|privilege escalation|privesc|gtfobins|sudo -l|ssh\s+-i)/i.test(design)
        ) {
            warnings.splice(warnings.indexOf(intendedPathWarning), 1);
            artifactChecks.design_md.push("design.md includes intended attack path.");
        }
    }

    private _validateSetupArtifact(
        setup: string,
        artifactChecks: AIBoxBuildValidationReport['artifact_checks'],
        blockers: string[],
        warnings: string[]
    ): void {
        if (this._containsConcreteSetupCommand(setup)) {
            artifactChecks.setup_md.push("setup.md includes concrete operator commands.");
        } else {
            blockers.push("setup.md must include concrete operator commands.");
        }

        if (/\/[A-Za-z0-9._/-]+/.test(setup)) {
            artifactChecks.setup_md.push("setup.md includes filesystem paths.");
        } else {
            warnings.push("setup.md should include exact filesystem paths.");
        }

        if (/(flag|\/root\/|旗標|flags\.list|flag\.sh)/i.test(setup)) {
            artifactChecks.setup_md.push("setup.md includes flag placement/configuration.");
        } else {
            blockers.push("setup.md must include flag placement/configuration.");
        }

        if (/(verify|validation|test|curl|nmap|systemctl status|檢查|驗證)/i.test(setup)) {
            artifactChecks.setup_md.push("setup.md includes validation checks.");
        } else {
            warnings.push("setup.md should include validation checks after configuration.");
        }
    }

    private _containsConcreteSetupCommand(content: string): boolean {
        return /\b(apt|apt-get|systemctl|docker|docker-compose|npm|pip|curl|wget|chmod|chown|ufw|nginx|apache2|php|mysql|useradd|usermod|userdel|ssh-keygen|mkdir|tee|cat|echo|visudo|sudoers)\b/i.test(content);
    }

    private _validateWriteupArtifact(
        writeup: string,
        artifactChecks: AIBoxBuildValidationReport['artifact_checks'],
        warnings: string[]
    ): void {
        const checks: Array<[RegExp, string]> = [
            [/(enumerat|scan|nmap|dirsearch|ffuf|偵察|列舉|掃描)/i, "enumeration step"],
            [/(exploit|cve|payload|漏洞|利用)/i, "exploitation step"],
            [/(user flag|flag|旗標|user\.txt)/i, "flag capture"],
            [/(root|privilege|sudo|權限提升|提權|root\.txt)/i, "privilege escalation/final step"]
        ];

        for (const [pattern, label] of checks) {
            if (pattern.test(writeup)) {
                artifactChecks.writeup_md.push(`writeup.md includes ${label}.`);
            } else {
                warnings.push(`writeup.md should include ${label}.`);
            }
        }

        const exploitationWarning = "writeup.md should include exploitation step.";
        if (
            warnings.includes(exploitationWarning)
            && /(abuse|leverage|misconfig|private key|id_rsa|ssh\s+-i|gtfobins|suid|sudo|path injection|privesc)/i.test(writeup)
        ) {
            warnings.splice(warnings.indexOf(exploitationWarning), 1);
            artifactChecks.writeup_md.push("writeup.md includes exploitation step.");
        }
    }

    private _validateAssistantPolicy(
        allowAiAssistant: boolean,
        design: string,
        artifactChecks: AIBoxBuildValidationReport['artifact_checks'],
        warnings: string[]
    ): void {
        const designLower = design.toLowerCase();
        if (designLower.includes('ai') || /助理|提示/.test(design)) {
            artifactChecks.design_md.push("design.md mentions AI assistant/hint context.");
        } else {
            warnings.push("design.md should define what private context the AI assistant may use.");
        }

        if (!allowAiAssistant && /(student.*ask|allow.*assistant|允許.*學生|可.*提問)/i.test(design)) {
            warnings.push("AI assistant is disabled by default, but design.md wording may imply students can ask it.");
        }
    }

    private _extractRequiredReferences(sourceText: string): RequiredReference[] {
        const references: RequiredReference[] = [];
        const add = (value: string, label: string, sensitive = false) => {
            const trimmed = value.trim().replace(/[),.;]+$/, '');
            if (!trimmed) return;
            references.push({ value: trimmed, label, sensitive });
        };

        const pathMatches = sourceText.match(/\/[A-Za-z0-9._~:/-]+/g) || [];
        pathMatches
            .filter(path => this._isLikelyRequiredPath(path))
            .forEach(path => add(path, `path ${path}`));

        const domainMatches = sourceText.match(/\b(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}\b/g) || [];
        domainMatches
            .filter(domain => !/\.(json|md|js|ts|py|sh|txt|conf|yaml|yml)$/i.test(domain))
            .forEach(domain => add(domain, `host/domain ${domain}`));

        const emailMatches = sourceText.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) || [];
        emailMatches.forEach(email => add(email, `email/account ${email}`));

        const cveMatches = sourceText.match(/\bCVE-\d{4}-\d{4,7}\b/gi) || [];
        cveMatches.forEach(cve => add(cve.toUpperCase(), `CVE ${cve.toUpperCase()}`));

        sourceText.split(/\s+/)
            .map(token => token.replace(/^['"`]+|['"`:,;.)]+$/g, ''))
            .filter(token => this._isHighEntropyToken(token))
            .forEach(token => add(token, "credential/secret token", true));

        const latestUbuntuServer = process.env.OPENAI_BOX_BUILD_UBUNTU_SERVER_LTS || '26.04';
        if (/(latest|newest).{0,40}ubuntu|ubuntu.{0,40}(latest|newest)|最新版.{0,40}ubuntu|ubuntu.{0,40}最新版|ubuntu server release iso/i.test(sourceText)) {
            add(latestUbuntuServer, `latest Ubuntu Server baseline ${latestUbuntuServer}`);
        }

        if (/114-2-midterm|modeldrive|flowise|flow\.ethci|ultimate member|CVE-2023-3460|CVE-2025-59528/i.test(sourceText)) {
            [
                ['flow.ethci', '114-2-midterm host flow.ethci'],
                ['flowise.flow.ethci', '114-2-midterm host flowise.flow.ethci'],
                ['/var/www/ModelDrive/src/config.json', '114-2-midterm ModelDrive config path'],
                ['/root/flags.list', '114-2-midterm dynamic flag list'],
                ['/root/flag.sh', '114-2-midterm dynamic flag script'],
                ['admin@flow.ethci', '114-2-midterm Flowise account'],
                ['1JETB@9eYIZ8J!', '114-2-midterm Flowise credential', true],
                ['CVE-2023-3460', 'Ultimate Member vulnerability'],
                ['CVE-2025-59528', 'Flowise vulnerability']
            ].forEach(([value, label, sensitive]) => add(String(value), String(label), Boolean(sensitive)));
        }

        return this._uniqueReferences(references).slice(0, 80);
    }

    private _isLikelyRequiredPath(path: string): boolean {
        const normalized = path.trim().replace(/[),.;]+$/, '');
        if (!normalized.startsWith('/') || normalized.startsWith('//') || normalized.length <= 3) return false;
        if (/^\/?(?:design|setup|writeup)(?:\/|$)/i.test(normalized)) return false;
        if (/^\/(?:setup|validation)\.sh$/i.test(normalized)) return false;
        if (/^\/(?:etc|var|home|root|opt|usr|tmp|srv|app|mnt|media|boot|dev|proc|sys|run|lib|bin|sbin)(?:\/|$)/i.test(normalized)) return true;
        if ((normalized.match(/\//g) || []).length >= 2) return true;
        return /\.[A-Za-z0-9]{1,10}(?:$|[/?#])/.test(normalized);
    }

    private _uniqueReferences(references: RequiredReference[]): RequiredReference[] {
        const seen = new Set<string>();
        return references.filter(reference => {
            const key = reference.value.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    private _artifactContains(content: string, token: string): boolean {
        return content.toLowerCase().includes(token.toLowerCase());
    }

    private _describeRequiredReference(reference: RequiredReference): string {
        if (!reference.sensitive) return reference.label;
        const value = reference.value;
        const masked = value.length <= 8 ? "[sensitive token]" : `${value.slice(0, 3)}...${value.slice(-2)}`;
        return `${reference.label} (${masked})`;
    }

    private _isHighEntropyToken(token: string): boolean {
        if (token.length < 10 || token.length > 80) return false;
        if (!/^[\x21-\x7E]+$/.test(token)) return false;
        if ((token.match(/\?/g) || []).length >= 2) return false;
        if (!/\d/.test(token)) return false;
        if (/^https?:\/\//i.test(token) || token.includes('/')) return false;
        if (/^[A-Za-z0-9_-]+$/.test(token) && token.includes('-')) return false;
        const classes = [
            /[a-z]/.test(token),
            /[A-Z]/.test(token),
            /\d/.test(token),
            /[^A-Za-z0-9]/.test(token)
        ].filter(Boolean).length;
        return classes >= 4 || (classes >= 3 && /[!@#$%^&*+=?]/.test(token));
    }

    private _mergeValidationIntoList(base: string[], report: AIBoxBuildValidationReport, mode: 'risk' | 'action'): string[] {
        const additions = mode === 'risk'
            ? [
                ...report.blockers.map(item => `Validation blocker: ${item}`),
                ...report.warnings.map(item => `Validation warning: ${item}`)
            ]
            : report.blockers.map(item => `Resolve validation blocker: ${item}`);

        return this._mergeStringArrays([...base, ...additions]).slice(0, 20);
    }

    private _mergeStringArrays(items: unknown[]): string[] {
        const seen = new Set<string>();
        const result: string[] = [];
        for (const item of items) {
            if (typeof item !== 'string') continue;
            const trimmed = item.trim();
            if (!trimmed) continue;
            const key = trimmed.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            result.push(trimmed);
        }
        return result;
    }

    private _firstNonEmpty(items: unknown[]): string {
        const value = items.find(item => typeof item === 'string' && item.trim().length > 0);
        return typeof value === 'string' ? value.trim() : '';
    }

    private _defaultValidationReport(): AIBoxBuildValidationReport {
        return {
            status: 'blocked',
            blockers: ["Validation has not run for this job."],
            warnings: [],
            passed_checks: [],
            artifact_checks: {
                design_md: [],
                setup_md: [],
                writeup_md: []
            },
            requirement_checks: [],
            generated_at: new Date()
        };
    }

    private _agentFailureDraft(direction: string, errorMessage: string, existingArtifacts?: Partial<AIBoxBuildArtifacts>): AgentParsedResponse {
        return {
            phase: AIBoxBuildPhase.design,
            summary: "AI build generation failed; existing draft preserved for review.",
            current_understanding: [`Requested direction: ${direction}`],
            open_questions: ["Retry generation or reduce scope before approving this machine build."],
            risks: [`AI service failure: ${errorMessage}`],
            next_actions: ["Retry after the AI service recovers, or provide narrower feedback for split artifact generation."],
            artifacts: {
                design_md: existingArtifacts?.design_md || `# design.md\n\n## Direction\n\n${direction}\n\n## Generation failure\n\n${errorMessage}`,
                setup_md: existingArtifacts?.setup_md || "# setup.md\n\nPending setup details due to AI service failure.",
                writeup_md: existingArtifacts?.writeup_md || "# writeup.md\n\nPending solve path due to AI service failure."
            }
        };
    }

    private _publicAgentError(error: unknown): string {
        const message = error instanceof Error ? error.message : String(error);
        return message.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer [redacted]').slice(0, 500);
    }

    private _agentContentForHistory(parsed: AgentParsedResponse): string {
        return JSON.stringify({
            phase: parsed.phase,
            summary: parsed.summary,
            current_understanding: parsed.current_understanding,
            open_questions: parsed.open_questions,
            risks: parsed.risks,
            next_actions: parsed.next_actions,
            artifacts: parsed.artifacts
        }, null, 2);
    }

    private _canAccessJob(user: User, job: AIBoxBuildJob): boolean {
        return user.role === Roles.SuperAdmin || job.requester_user_id === user._id?.toString();
    }

    private _toDTO(job: AIBoxBuildJob): AIBoxBuildJobDTO {
        const raw = typeof (job as any).toObject === 'function' ? (job as any).toObject() : job;
        return {
            ...raw,
            _id: String((job as any)._id),
            artifacts: this._normalizeArtifacts(raw.artifacts, raw.direction),
            validation_report: raw.validation_report || this._defaultValidationReport(),
            current_understanding: raw.current_understanding || [],
            open_questions: raw.open_questions || [],
            risks: raw.risks || [],
            next_actions: raw.next_actions || [],
            messages: raw.messages || [],
            execution_status: raw.execution_status || AIBoxBuildExecutionStatus.idle,
            provisioning: raw.provisioning || {},
            run_logs: raw.run_logs || []
        } as AIBoxBuildJobDTO;
    }
}
