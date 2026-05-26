import {
    AIBoxBuildArtifacts,
    AIBoxBuildExecutionStatus,
    AIBoxBuildJob,
    AIBoxBuildValidationReport
} from "../../interfaces/AIBoxBuildJob";
import { env } from "../../config/env";
import { publicAIBoxAgentError } from "./AIBoxBuildAgentResponsePolicy";
import { normalizeAIBoxBuildArtifacts } from "./AIBoxBuildArtifactPolicy";
import {
    buildAIBoxBuildRunCompletionPersistence,
    buildAIBoxBuildRunFailureUpdate
} from "./AIBoxBuildExecutionPolicy";
import {
    buildAIBoxOpenCodeRunPrompt,
    normalizeOpenCodeRunModel
} from "./AIBoxBuildOpenCodePolicy";
import { AIBoxRunRequest } from "./AIBoxBuildRunPolicy";
import { buildAIBoxRunLogPushUpdate } from "./AIBoxBuildRunLogPolicy";
import { validateAIBoxBuildArtifacts } from "./AIBoxBuildValidationPolicy";
import { aiBoxBuildJobRepository } from "./AIBoxBuildJobRepository";
import { aiBoxBuildWorkspaceService } from "./AIBoxBuildWorkspaceService";
import { AIBoxBuildProvisioningService } from "./AIBoxBuildProvisioningService";
import { AIBoxBuildSSHExecutionService } from "./AIBoxBuildSSHExecutionService";
import { CommandResult, openCodeRunner } from "../opencode/OpenCodeRunner";

type AIBoxVMContext = {
    vmId?: string;
    pveVmid?: string;
    pveNode?: string;
    vmIp?: string;
    sshUser?: string;
    sshPassword?: string;
};

type RunExecutionJobRepository = {
    findById(jobId: string): Promise<any | null>;
    updateById(jobId: string, update: unknown): Promise<unknown>;
};

type RunExecutionWorkspaceService = {
    prepareOpencodeWorkspace(input: {
        jobId: string;
        job: AIBoxBuildJob;
        config: AIBoxRunRequest;
        vmContext: AIBoxVMContext;
    }): Promise<string>;
    refreshArtifactsFromWorkspace(jobId: string, workspacePath: string): Promise<void>;
    writeReferenceFallbackFiles(workspacePath: string, reason: string): Promise<boolean>;
    ensureGeneratedScript(workspacePath: string, scriptName: "setup.sh" | "validation.sh"): Promise<void>;
};

type RunExecutionCommandRunner = {
    runCommand(command: string, args: string[], options: {
        cwd?: string;
        timeoutMs: number;
        env: NodeJS.ProcessEnv;
    }): Promise<CommandResult>;
    summarizeCommandResult(label: string, result: CommandResult): string;
};

type RunExecutionProvisioningService = {
    provisionAndBootVM(input: {
        jobId: string;
        config: AIBoxRunRequest;
        authorizationHeader: string;
        userSnapshot: { _id: string; role: string; email?: string };
    }): Promise<AIBoxVMContext>;
};

type RunExecutionSSHService = {
    uploadAndRunScript(input: {
        workspacePath: string;
        scriptName: "setup.sh" | "validation.sh";
        vmContext: AIBoxVMContext;
        timeoutMs: number;
    }): Promise<CommandResult>;
};

type AIBoxBuildRunExecutionServiceDeps = {
    jobRepo?: RunExecutionJobRepository;
    workspaceService?: RunExecutionWorkspaceService;
    commandRunner?: RunExecutionCommandRunner;
    provisioningServiceFactory?: () => RunExecutionProvisioningService;
    sshExecutionServiceFactory?: (input: {
        appendRunLog: (stage: string, level: "info" | "warning" | "error", message: string) => Promise<void>;
        childProcessEnv: (extra?: NodeJS.ProcessEnv) => NodeJS.ProcessEnv;
    }) => RunExecutionSSHService;
    childProcessEnv?: (extra?: NodeJS.ProcessEnv) => NodeJS.ProcessEnv;
    config?: {
        opencodeBin: string;
        opencodeBoxBuildModel: string;
        openAIBoxBuildModel: string;
        openAIModel: string;
        latestUbuntuServer: string;
        runTimeoutMs: number;
        setupTimeoutMs: number;
        validationTimeoutMs: number;
    };
};

export class AIBoxBuildRunExecutionService {
    private readonly jobRepo: RunExecutionJobRepository;
    private readonly workspaceService: RunExecutionWorkspaceService;
    private readonly commandRunner: RunExecutionCommandRunner;
    private readonly provisioningServiceFactory: () => RunExecutionProvisioningService;
    private readonly sshExecutionServiceFactory: NonNullable<AIBoxBuildRunExecutionServiceDeps["sshExecutionServiceFactory"]>;
    private readonly childProcessEnv: (extra?: NodeJS.ProcessEnv) => NodeJS.ProcessEnv;
    private readonly config: NonNullable<AIBoxBuildRunExecutionServiceDeps["config"]>;

    constructor(deps: AIBoxBuildRunExecutionServiceDeps = {}) {
        this.jobRepo = deps.jobRepo ?? aiBoxBuildJobRepository;
        this.workspaceService = deps.workspaceService ?? aiBoxBuildWorkspaceService;
        this.commandRunner = deps.commandRunner ?? openCodeRunner;
        this.provisioningServiceFactory = deps.provisioningServiceFactory ?? (() => new AIBoxBuildProvisioningService());
        this.sshExecutionServiceFactory = deps.sshExecutionServiceFactory ?? ((input) => new AIBoxBuildSSHExecutionService(input));
        this.childProcessEnv = deps.childProcessEnv ?? ((extra = {}) => ({ ...process.env, ...extra }));
        this.config = deps.config ?? {
            opencodeBin: env.opencode.bin,
            opencodeBoxBuildModel: env.opencode.boxBuildModel,
            openAIBoxBuildModel: env.openai.boxBuildModel,
            openAIModel: env.openai.model,
            latestUbuntuServer: env.openai.boxBuildUbuntuServerLts,
            runTimeoutMs: env.opencode.runTimeoutMs,
            setupTimeoutMs: env.opencode.setupTimeoutMs,
            validationTimeoutMs: env.opencode.validationTimeoutMs
        };
    }

    public async executeBuildRun(input: {
        jobId: string;
        config: AIBoxRunRequest;
        authorizationHeader: string;
        userSnapshot: { _id: string; role: string; email?: string };
    }): Promise<void> {
        const { jobId, config, authorizationHeader, userSnapshot } = input;
        try {
            const job = await this.jobRepo.findById(jobId);
            if (!job) return;

            await this.appendRunLog(jobId, "run", "info", "Execution worker started.");
            let vmContext: AIBoxVMContext = {
                sshUser: config.ciuser || "root",
                sshPassword: config.cipassword || ""
            };

            if (!config.dry_run) {
                const provisioningService = this.provisioningServiceFactory();
                vmContext = await provisioningService.provisionAndBootVM({
                    jobId,
                    config,
                    authorizationHeader,
                    userSnapshot
                });
            } else {
                await this.appendRunLog(jobId, "provision", "warning", "Dry run enabled; VM provisioning and SSH execution were skipped.");
            }

            const workspacePath = await this.workspaceService.prepareOpencodeWorkspace({
                jobId,
                job,
                config,
                vmContext
            });
            await this.setExecutionStatus(jobId, AIBoxBuildExecutionStatus.generating_setup, "Running opencode to generate setup and validation scripts.");
            await this.runOpencodeGenerator(jobId, workspacePath, job, config, vmContext);
            await this.workspaceService.refreshArtifactsFromWorkspace(jobId, workspacePath);

            if (!config.dry_run) {
                await this.setExecutionStatus(jobId, AIBoxBuildExecutionStatus.configuring, "Executing generated setup.sh on the VM.");
                const setupResult = await this.uploadAndRunScript(jobId, workspacePath, "setup.sh", vmContext, this.config.setupTimeoutMs);
                await this.jobRepo.updateById(jobId, { setup_exit_code: setupResult.exitCode ?? -1, updated_at: new Date() });
                if (setupResult.exitCode !== 0) {
                    throw new Error(`setup.sh failed with exit code ${setupResult.exitCode ?? "unknown"}`);
                }

                await this.setExecutionStatus(jobId, AIBoxBuildExecutionStatus.verifying, "Executing generated validation.sh on the VM.");
                const validationResult = await this.uploadAndRunScript(jobId, workspacePath, "validation.sh", vmContext, this.config.validationTimeoutMs);
                await this.jobRepo.updateById(jobId, { validation_exit_code: validationResult.exitCode ?? -1, updated_at: new Date() });
                if (validationResult.exitCode !== 0) {
                    throw new Error(`validation.sh failed with exit code ${validationResult.exitCode ?? "unknown"}`);
                }
            }

            await this.completeRunFromLatestJob(jobId, config);
        } catch (error) {
            const message = publicAIBoxAgentError(error);
            await this.jobRepo.updateById(jobId, buildAIBoxBuildRunFailureUpdate(message));
        }
    }

    private async completeRunFromLatestJob(jobId: string, config: AIBoxRunRequest): Promise<void> {
        const updatedJob = await this.jobRepo.findById(jobId);
        if (!updatedJob) return;

        const artifacts = normalizeAIBoxBuildArtifacts(updatedJob.artifacts, updatedJob.direction);
        const validationReport = this.validateBuildArtifacts({
            direction: updatedJob.direction,
            constraints: updatedJob.constraints || "",
            allowAiAssistant: updatedJob.allow_ai_assistant,
            artifacts
        });
        const completionPersistence = buildAIBoxBuildRunCompletionPersistence({
            dryRun: config.dry_run,
            nextActions: updatedJob.next_actions || [],
            validationReport,
            runLogs: updatedJob.run_logs
        });
        updatedJob.validation_report = completionPersistence.validation_report;
        updatedJob.phase = completionPersistence.phase;
        updatedJob.execution_status = completionPersistence.execution_status;
        updatedJob.status = completionPersistence.status;
        updatedJob.error_message = completionPersistence.error_message;
        updatedJob.next_actions = completionPersistence.next_actions;
        updatedJob.run_logs = completionPersistence.run_logs;
        await updatedJob.save();
    }

    private async runOpencodeGenerator(
        jobId: string,
        workspacePath: string,
        job: AIBoxBuildJob,
        config: AIBoxRunRequest,
        vmContext: { vmIp?: string; pveVmid?: string; pveNode?: string; sshUser?: string }
    ): Promise<void> {
        const rawModel = this.config.opencodeBoxBuildModel || this.config.openAIBoxBuildModel || this.config.openAIModel;
        const model = normalizeOpenCodeRunModel(rawModel);
        await this.jobRepo.updateById(jobId, { opencode_model: model, updated_at: new Date() });
        const prompt = buildAIBoxOpenCodeRunPrompt({
            latestUbuntuServer: this.config.latestUbuntuServer,
            pveNode: vmContext.pveNode,
            pveVmid: vmContext.pveVmid,
            vmIp: vmContext.vmIp,
            sshUser: vmContext.sshUser,
            fallbackSshUser: config.ciuser
        });

        const result = await this.commandRunner.runCommand(
            this.config.opencodeBin,
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
                timeoutMs: this.config.runTimeoutMs,
                env: this.childProcessEnv({ OPENCODE_DISABLE_AUTOUPDATE: "true" })
            }
        );

        await this.appendRunLog(jobId, "opencode", result.exitCode === 0 ? "info" : "error", this.commandRunner.summarizeCommandResult("opencode run", result));
        if (result.exitCode !== 0) {
            const reason = `opencode run failed with exit code ${result.exitCode ?? "unknown"}`;
            if (await this.workspaceService.writeReferenceFallbackFiles(workspacePath, reason)) {
                await this.appendRunLog(jobId, "reference-fallback", "warning", `Generated build files from 114-2-midterm_v2 reference bundle after opencode failure: ${reason}`);
                return;
            }
            throw new Error(`opencode run failed with exit code ${result.exitCode ?? "unknown"}`);
        }

        try {
            await this.workspaceService.ensureGeneratedScript(workspacePath, "setup.sh");
            await this.workspaceService.ensureGeneratedScript(workspacePath, "validation.sh");
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (await this.workspaceService.writeReferenceFallbackFiles(workspacePath, message)) {
                await this.appendRunLog(jobId, "reference-fallback", "warning", `Generated build files from 114-2-midterm_v2 reference bundle after opencode failure: ${message}`);
                return;
            }
            throw error;
        }
    }

    private uploadAndRunScript(
        jobId: string,
        workspacePath: string,
        scriptName: "setup.sh" | "validation.sh",
        vmContext: AIBoxVMContext,
        timeoutMs: number
    ): Promise<CommandResult> {
        const service = this.sshExecutionServiceFactory({
            childProcessEnv: (extra) => this.childProcessEnv(extra),
            appendRunLog: (stage, level, message) => this.appendRunLog(jobId, stage, level, message)
        });

        return service.uploadAndRunScript({
            workspacePath,
            scriptName,
            vmContext,
            timeoutMs,
        });
    }

    private async setExecutionStatus(jobId: string, status: AIBoxBuildExecutionStatus, message: string): Promise<void> {
        await this.jobRepo.updateById(
            jobId,
            {
                execution_status: status,
                updated_at: new Date(),
                ...buildAIBoxRunLogPushUpdate(status, "info", message)
            }
        );
    }

    private async appendRunLog(jobId: string, stage: string, level: "info" | "warning" | "error", message: string): Promise<void> {
        await this.jobRepo.updateById(
            jobId,
            {
                updated_at: new Date(),
                ...buildAIBoxRunLogPushUpdate(stage, level, message)
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
