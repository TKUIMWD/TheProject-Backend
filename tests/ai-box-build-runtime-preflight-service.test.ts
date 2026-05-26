import { describe, expect, it } from "vitest";
import { AIBoxBuildRuntimePreflightService } from "../src/modules/ai-box-build/AIBoxBuildRuntimePreflightService";

function makeCommandResult(exitCode: number) {
    return {
        exitCode,
        stdout: exitCode === 0 ? "ok" : "",
        stderr: exitCode === 0 ? "" : "missing",
        timedOut: false
    };
}

function makeService(options: {
    exits?: number[];
    openAIApiKey?: string;
    openAIBaseUrl?: string;
} = {}) {
    const calls: Array<{ command: string; args: string[]; env: NodeJS.ProcessEnv }> = [];
    const exits = [...(options.exits ?? [0, 0])];
    const service = new AIBoxBuildRuntimePreflightService({
        commandRunner: {
            runCommand: async (command, args, runOptions) => {
                calls.push({ command, args, env: runOptions.env });
                return makeCommandResult(exits.length > 0 ? exits.shift()! : 0);
            },
            summarizeCommandResult: (label, result) => `${label} exit=${result.exitCode}`
        },
        childProcessEnv: (extra = {}) => ({ BASE: "1", ...extra } as any),
        config: {
            openAIApiKey: options.openAIApiKey ?? "sk-test",
            openAIBaseUrl: options.openAIBaseUrl ?? "https://api.example.test/v1",
            opencodeBinary: "opencode",
            preflightTimeoutMs: 1000
        }
    });

    return { calls, service };
}

describe("AIBoxBuildRuntimePreflightService", () => {
    it("checks opencode and sshpass for real runs", async () => {
        const { service, calls } = makeService();

        await expect(service.validateRuntimePreflight({
            dry_run: false
        } as any)).resolves.toBeNull();

        expect(calls.map((call) => [call.command, call.args])).toEqual([
            ["opencode", ["--version"]],
            ["sshpass", ["-V"]]
        ]);
        expect(calls[0].env).toMatchObject({
            BASE: "1",
            OPENCODE_DISABLE_AUTOUPDATE: "true"
        });
    });

    it("skips sshpass for dry runs", async () => {
        const { service, calls } = makeService();

        await expect(service.validateRuntimePreflight({
            dry_run: true
        } as any)).resolves.toBeNull();

        expect(calls.map((call) => call.command)).toEqual(["opencode"]);
    });

    it("returns aggregated runtime preflight errors", async () => {
        const { service } = makeService({
            exits: [1, 1],
            openAIApiKey: "",
            openAIBaseUrl: ""
        });

        await expect(service.validateRuntimePreflight({
            dry_run: false
        } as any)).resolves.toMatchObject({
            code: 500,
            message: expect.stringContaining("AI build runtime preflight failed")
        });
    });
});
