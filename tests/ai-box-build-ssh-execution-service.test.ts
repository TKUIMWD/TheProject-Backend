import { describe, expect, it } from "vitest";
import { AIBoxBuildSSHExecutionService } from "../src/modules/ai-box-build/AIBoxBuildSSHExecutionService";

function result(exitCode = 0) {
    return {
        exitCode,
        stdout: exitCode === 0 ? "ok" : "",
        stderr: exitCode === 0 ? "" : "bad",
        timedOut: false
    };
}

function makeService(options: {
    exits?: number[];
    hasReference?: boolean;
} = {}) {
    const calls: Array<{ command: string; args: string[]; options: any }> = [];
    const logs: Array<{ stage: string; level: string; message: string }> = [];
    const exits = [...(options.exits ?? [])];
    const commandRunner = {
        runCommand: async (command: string, args: string[], runOptions: any) => {
            calls.push({ command, args, options: runOptions });
            return result(exits.length > 0 ? exits.shift() : 0);
        },
        summarizeCommandResult: (label: string, commandResult: ReturnType<typeof result>) => `${label} exit=${commandResult.exitCode}`
    };

    const service = new AIBoxBuildSSHExecutionService({
        commandRunner,
        childProcessEnv: (extra = {}) => ({ BASE: "1", ...extra } as any),
        appendRunLog: async (stage, level, message) => {
            logs.push({ stage, level, message });
        },
        stat: async () => ({
            isDirectory: () => options.hasReference === true
        }) as any
    });

    return {
        calls,
        logs,
        service
    };
}

describe("AIBoxBuildSSHExecutionService", () => {
    it("uploads reference bundle, uploads script, and runs it with sudo input", async () => {
        const { service, calls, logs } = makeService({ hasReference: true });

        await expect(service.uploadAndRunScript({
            workspacePath: "/tmp/workspace/job-1",
            scriptName: "setup.sh",
            vmContext: {
                vmIp: "10.0.0.5",
                sshUser: "student",
                sshPassword: "secret"
            },
            timeoutMs: 120000
        })).resolves.toMatchObject({ exitCode: 0 });

        expect(calls.map(call => call.args[0])).toEqual(["-e", "-e", "-e", "-e", "-e"]);
        expect(calls).toHaveLength(5);
        expect(calls[0].args.at(-1)).toBe("mkdir -p /tmp/cstg-ai-build");
        expect(calls[1].args.at(-1)).toBe("rm -rf /tmp/cstg-ai-build/reference");
        expect(calls[2].args).toContain("/tmp/workspace/job-1/reference");
        expect(calls[3].args).toContain("/tmp/workspace/job-1/generated/setup.sh");
        expect(calls[4].args.at(-1)).toBe("sudo -S -p '' bash /tmp/cstg-ai-build/setup.sh");
        expect(calls[4].options.input).toBe("secret\n");
        expect(logs).toEqual(expect.arrayContaining([
            { stage: "setup.sh", level: "info", message: "Uploading setup.sh to student@10.0.0.5." },
            { stage: "setup.sh", level: "info", message: "Uploading reference bundle to student@10.0.0.5." },
            { stage: "setup.sh", level: "info", message: "run setup.sh exit=0" }
        ]));
    });

    it("skips reference upload when no reference directory exists", async () => {
        const { service, calls } = makeService({ hasReference: false });

        await service.uploadAndRunScript({
            workspacePath: "/tmp/workspace/job-1",
            scriptName: "validation.sh",
            vmContext: {
                vmIp: "10.0.0.6",
                sshUser: "root",
                sshPassword: ""
            },
            timeoutMs: 120000
        });

        expect(calls).toHaveLength(3);
        expect(calls[2].args.at(-1)).toBe("bash /tmp/cstg-ai-build/validation.sh");
        expect(calls[2].options.input).toBeUndefined();
    });

    it("throws a stable error when script upload fails", async () => {
        const { service, logs } = makeService({
            hasReference: false,
            exits: [0, 1]
        });

        await expect(service.uploadAndRunScript({
            workspacePath: "/tmp/workspace/job-1",
            scriptName: "setup.sh",
            vmContext: {
                vmIp: "10.0.0.7",
                sshUser: "root"
            },
            timeoutMs: 120000
        })).rejects.toThrow("Failed to upload setup.sh");

        expect(logs).toContainEqual({
            stage: "setup.sh",
            level: "error",
            message: "scp setup.sh exit=1"
        });
    });
});
