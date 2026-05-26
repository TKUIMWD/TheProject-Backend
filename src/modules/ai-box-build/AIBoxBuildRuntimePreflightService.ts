import { env } from "../../config/env";
import { CommandResult, openCodeRunner } from "../opencode/OpenCodeRunner";
import { createResponse, resp } from "../../utils/resp";
import { AIBoxRunRequest } from "./AIBoxBuildRunPolicy";
import {
    buildAIBoxRuntimePreflightFailureMessage,
    buildOpencodePreflightError,
    buildSshpassPreflightError,
    shouldCheckSshpassForAIBoxRun,
    validateAIBoxRuntimeConfig
} from "./AIBoxBuildRuntimePreflightPolicy";

type RuntimePreflightCommandRunner = {
    runCommand(command: string, args: string[], options: { timeoutMs: number; env: NodeJS.ProcessEnv }): Promise<CommandResult>;
    summarizeCommandResult(label: string, result: CommandResult): string;
};

type AIBoxBuildRuntimePreflightServiceDeps = {
    commandRunner?: RuntimePreflightCommandRunner;
    childProcessEnv?: (extra?: NodeJS.ProcessEnv) => NodeJS.ProcessEnv;
    config?: {
        openAIApiKey: string;
        openAIBaseUrl: string;
        opencodeBinary: string;
        preflightTimeoutMs: number;
    };
};

export class AIBoxBuildRuntimePreflightService {
    private readonly commandRunner: RuntimePreflightCommandRunner;
    private readonly childProcessEnv: (extra?: NodeJS.ProcessEnv) => NodeJS.ProcessEnv;
    private readonly config: NonNullable<AIBoxBuildRuntimePreflightServiceDeps["config"]>;

    constructor(deps: AIBoxBuildRuntimePreflightServiceDeps = {}) {
        this.commandRunner = deps.commandRunner ?? openCodeRunner;
        this.childProcessEnv = deps.childProcessEnv ?? ((extra = {}) => ({ ...process.env, ...extra }));
        this.config = deps.config ?? {
            openAIApiKey: env.openai.apiKey,
            openAIBaseUrl: env.openai.baseUrl,
            opencodeBinary: env.opencode.bin,
            preflightTimeoutMs: env.opencode.preflightTimeoutMs
        };
    }

    public async validateRuntimePreflight(config: AIBoxRunRequest): Promise<resp<undefined> | null> {
        const errors = validateAIBoxRuntimeConfig({
            openAIApiKey: this.config.openAIApiKey,
            openAIBaseUrl: this.config.openAIBaseUrl
        });

        const opencode = await this.commandRunner.runCommand(this.config.opencodeBinary, ["--version"], {
            timeoutMs: this.config.preflightTimeoutMs,
            env: this.childProcessEnv({ OPENCODE_DISABLE_AUTOUPDATE: "true" })
        });
        if (opencode.exitCode !== 0) {
            errors.push(buildOpencodePreflightError(
                this.config.opencodeBinary,
                this.commandRunner.summarizeCommandResult("opencode --version", opencode)
            ));
        }

        if (shouldCheckSshpassForAIBoxRun(config.dry_run)) {
            const sshpass = await this.commandRunner.runCommand("sshpass", ["-V"], {
                timeoutMs: this.config.preflightTimeoutMs,
                env: this.childProcessEnv()
            });
            if (sshpass.exitCode !== 0) {
                errors.push(buildSshpassPreflightError(this.commandRunner.summarizeCommandResult("sshpass -V", sshpass)));
            }
        }

        if (errors.length > 0) {
            return createResponse(500, buildAIBoxRuntimePreflightFailureMessage(errors));
        }

        return null;
    }
}

export const aiBoxBuildRuntimePreflightService = new AIBoxBuildRuntimePreflightService();
