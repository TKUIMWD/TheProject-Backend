import * as fs from "fs/promises";
import { CommandResult, openCodeRunner } from "../opencode/OpenCodeRunner";
import { buildAIBoxBuildSSHExecutionPlan } from "./AIBoxBuildSSHExecutionPolicy";

type CommandRunnerPort = {
    runCommand(command: string, args: string[], options: { timeoutMs: number; env?: NodeJS.ProcessEnv; input?: string }): Promise<CommandResult>;
    summarizeCommandResult(label: string, result: CommandResult): string;
};

export type AIBoxBuildSSHExecutionServiceDeps = {
    commandRunner?: CommandRunnerPort;
    childProcessEnv?: (extra?: NodeJS.ProcessEnv) => NodeJS.ProcessEnv;
    appendRunLog?: (stage: string, level: "info" | "warning" | "error", message: string) => Promise<void>;
    stat?: typeof fs.stat;
};

const defaultChildProcessEnv = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
    ...process.env,
    ...extra
});

export class AIBoxBuildSSHExecutionService {
    private readonly commandRunner: CommandRunnerPort;
    private readonly childProcessEnv: (extra?: NodeJS.ProcessEnv) => NodeJS.ProcessEnv;
    private readonly appendRunLog?: (stage: string, level: "info" | "warning" | "error", message: string) => Promise<void>;
    private readonly stat: typeof fs.stat;

    constructor(deps: AIBoxBuildSSHExecutionServiceDeps = {}) {
        this.commandRunner = deps.commandRunner ?? openCodeRunner;
        this.childProcessEnv = deps.childProcessEnv ?? defaultChildProcessEnv;
        this.appendRunLog = deps.appendRunLog;
        this.stat = deps.stat ?? fs.stat;
    }

    public async uploadAndRunScript(input: {
        workspacePath: string;
        scriptName: "setup.sh" | "validation.sh";
        vmContext: { vmIp?: string; sshUser?: string; sshPassword?: string };
        timeoutMs: number;
    }): Promise<CommandResult> {
        if (!input.vmContext.vmIp) throw new Error("VM IP is required before SSH execution");
        const sshPassword = input.vmContext.sshPassword || "";
        const executionPlan = buildAIBoxBuildSSHExecutionPlan({
            workspacePath: input.workspacePath,
            scriptName: input.scriptName,
            vmIp: input.vmContext.vmIp,
            sshUser: input.vmContext.sshUser,
            sshPassword
        });

        await this.log(input.scriptName, "info", executionPlan.uploadLogMessage);
        const mkdir = await this.commandRunner.runCommand("sshpass", executionPlan.mkdirArgs, {
            timeoutMs: 60 * 1000,
            env: this.childProcessEnv({ SSHPASS: sshPassword })
        });
        if (mkdir.exitCode !== 0) {
            await this.log(input.scriptName, "error", this.commandRunner.summarizeCommandResult(`ssh mkdir for ${input.scriptName}`, mkdir));
            throw new Error(`Failed to prepare remote script directory for ${input.scriptName}`);
        }

        const referenceStat = await this.stat(executionPlan.localReference).catch(() => null);
        if (referenceStat?.isDirectory()) {
            await this.log(input.scriptName, "info", executionPlan.referenceUploadLogMessage);
            const removeReference = await this.commandRunner.runCommand("sshpass", executionPlan.removeReferenceArgs, {
                timeoutMs: 60 * 1000,
                env: this.childProcessEnv({ SSHPASS: sshPassword })
            });
            if (removeReference.exitCode !== 0) {
                await this.log(input.scriptName, "error", this.commandRunner.summarizeCommandResult(`remove remote reference for ${input.scriptName}`, removeReference));
                throw new Error(`Failed to remove existing remote reference bundle for ${input.scriptName}`);
            }

            const uploadReference = await this.commandRunner.runCommand("sshpass", executionPlan.uploadReferenceArgs, {
                timeoutMs: 3 * 60 * 1000,
                env: this.childProcessEnv({ SSHPASS: sshPassword })
            });
            if (uploadReference.exitCode !== 0) {
                await this.log(input.scriptName, "error", this.commandRunner.summarizeCommandResult(`scp reference for ${input.scriptName}`, uploadReference));
                throw new Error(`Failed to upload reference bundle for ${input.scriptName}`);
            }
        }

        const upload = await this.commandRunner.runCommand("sshpass", executionPlan.uploadScriptArgs, {
            timeoutMs: 90 * 1000,
            env: this.childProcessEnv({ SSHPASS: sshPassword })
        });
        if (upload.exitCode !== 0) {
            await this.log(input.scriptName, "error", this.commandRunner.summarizeCommandResult(`scp ${input.scriptName}`, upload));
            throw new Error(`Failed to upload ${input.scriptName}`);
        }

        const run = await this.commandRunner.runCommand("sshpass", executionPlan.runScriptArgs, {
            timeoutMs: input.timeoutMs,
            env: this.childProcessEnv({ SSHPASS: sshPassword }),
            input: executionPlan.runInput
        });

        await this.log(input.scriptName, run.exitCode === 0 ? "info" : "error", this.commandRunner.summarizeCommandResult(`run ${input.scriptName}`, run));
        return run;
    }

    private async log(stage: string, level: "info" | "warning" | "error", message: string): Promise<void> {
        if (this.appendRunLog) {
            await this.appendRunLog(stage, level, message);
        }
    }
}

export const aiBoxBuildSSHExecutionService = new AIBoxBuildSSHExecutionService();
