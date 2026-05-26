import { describe, expect, it } from "vitest";
import { AIBoxBuildExecutionStatus, AIBoxBuildJobStatus, AIBoxBuildPhase } from "../src/interfaces/AIBoxBuildJob";
import { AIBoxBuildRunExecutionService } from "../src/modules/ai-box-build/AIBoxBuildRunExecutionService";

function commandResult(exitCode = 0) {
    return {
        exitCode,
        stdout: exitCode === 0 ? "ok" : "",
        stderr: exitCode === 0 ? "" : "bad",
        timedOut: false
    };
}

function longText(seed: string, repetitions = 70) {
    return Array.from({ length: repetitions }, (_, index) => `${seed} ${index}`).join("\n");
}

function makeArtifacts() {
    return {
        design_md: longText("Learning objective service map port intended attack path exploit credential password flag AI assistant private context", 60),
        setup_md: longText("Run apt-get install nginx then systemctl enable nginx and write /root/root.txt flag plus /home/student/user.txt flag. Verify with curl and systemctl status.", 60),
        writeup_md: longText("Enumeration with nmap discovers HTTP. Exploit the vulnerable service to get user flag, then use sudo privilege escalation to read root flag.", 45)
    };
}

function makeJob(overrides: Record<string, unknown> = {}) {
    return {
        _id: "job-1",
        requester_user_id: "user-1",
        requester_role: "admin",
        direction: "Build a web security challenge",
        constraints: "",
        allow_ai_assistant: true,
        status: AIBoxBuildJobStatus.awaiting_review,
        phase: AIBoxBuildPhase.implementation,
        summary: "",
        current_understanding: [],
        open_questions: [],
        risks: [],
        next_actions: [],
        artifacts: makeArtifacts(),
        validation_report: undefined,
        messages: [],
        execution_status: AIBoxBuildExecutionStatus.generating_setup,
        run_logs: [],
        created_at: new Date("2026-05-26T00:00:00.000Z"),
        updated_at: new Date("2026-05-26T00:00:00.000Z"),
        save: async function () {
            return this;
        },
        ...overrides
    } as any;
}

function makeService(options: {
    job?: any | null;
    latestJob?: any | null;
    opencodeExit?: number;
    fallbackWritten?: boolean;
    ensureScriptError?: Error;
    setupExit?: number;
    validationExit?: number;
    dryRun?: boolean;
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const updates: Array<{ jobId: string; update: any }> = [];
    let findCallCount = 0;
    const job = options.job === undefined ? makeJob() : options.job;
    const latestJob = options.latestJob === undefined ? makeJob() : options.latestJob;

    const service = new AIBoxBuildRunExecutionService({
        jobRepo: {
            findById: async (id) => {
                calls.push({ method: "findById", args: [id] });
                findCallCount += 1;
                return findCallCount === 1 ? job : latestJob;
            },
            updateById: async (jobId, update) => {
                calls.push({ method: "updateById", args: [jobId, update] });
                updates.push({ jobId, update });
            }
        },
        workspaceService: {
            prepareOpencodeWorkspace: async (input) => {
                calls.push({ method: "prepareOpencodeWorkspace", args: [input] });
                return "/tmp/ai-box-build/job-1";
            },
            refreshArtifactsFromWorkspace: async (jobId, workspacePath) => {
                calls.push({ method: "refreshArtifactsFromWorkspace", args: [jobId, workspacePath] });
            },
            writeReferenceFallbackFiles: async (workspacePath, reason) => {
                calls.push({ method: "writeReferenceFallbackFiles", args: [workspacePath, reason] });
                return options.fallbackWritten === true;
            },
            ensureGeneratedScript: async (workspacePath, scriptName) => {
                calls.push({ method: "ensureGeneratedScript", args: [workspacePath, scriptName] });
                if (options.ensureScriptError) throw options.ensureScriptError;
            }
        },
        commandRunner: {
            runCommand: async (command, args, runOptions) => {
                calls.push({ method: "runCommand", args: [command, args, runOptions] });
                return commandResult(options.opencodeExit ?? 0);
            },
            summarizeCommandResult: (label, result) => `${label} exit=${result.exitCode}`
        },
        provisioningServiceFactory: () => ({
            provisionAndBootVM: async (input) => {
                calls.push({ method: "provisionAndBootVM", args: [input] });
                return {
                    vmId: "vm-1",
                    pveVmid: "101",
                    pveNode: "pve-a",
                    vmIp: "10.0.0.5",
                    sshUser: "student",
                    sshPassword: "secret"
                };
            }
        }),
        sshExecutionServiceFactory: ({ appendRunLog }) => ({
            uploadAndRunScript: async (input) => {
                calls.push({ method: "uploadAndRunScript", args: [input] });
                await appendRunLog(input.scriptName, "info", `${input.scriptName} executed`);
                return commandResult(input.scriptName === "setup.sh" ? options.setupExit ?? 0 : options.validationExit ?? 0);
            }
        }),
        childProcessEnv: (extra = {}) => ({ BASE: "1", ...extra } as any),
        config: {
            opencodeBin: "opencode",
            opencodeBoxBuildModel: "box-model",
            openAIBoxBuildModel: "fallback-box-model",
            openAIModel: "chat-model",
            latestUbuntuServer: "24.04",
            runTimeoutMs: 1000,
            setupTimeoutMs: 2000,
            validationTimeoutMs: 3000
        }
    });

    return { calls, latestJob, service, updates };
}

describe("AIBoxBuildRunExecutionService", () => {
    it("runs a dry-run build through opencode and marks the job ready for review", async () => {
        const { service, calls, latestJob } = makeService();

        await service.executeBuildRun({
            jobId: "job-1",
            config: { dry_run: true, ciuser: "student" } as any,
            authorizationHeader: "Bearer token",
            userSnapshot: { _id: "user-1", role: "admin", email: "user@example.com" }
        });

        expect(calls.some((call) => call.method === "provisionAndBootVM")).toBe(false);
        expect(calls.some((call) => call.method === "uploadAndRunScript")).toBe(false);
        expect(calls).toContainEqual({ method: "ensureGeneratedScript", args: ["/tmp/ai-box-build/job-1", "setup.sh"] });
        expect(calls).toContainEqual({ method: "ensureGeneratedScript", args: ["/tmp/ai-box-build/job-1", "validation.sh"] });
        expect(latestJob.execution_status).toBe(AIBoxBuildExecutionStatus.ready_for_review);
        expect(latestJob.status).toBe(AIBoxBuildJobStatus.awaiting_review);
        expect(latestJob.phase).toBe(AIBoxBuildPhase.verification);
    });

    it("provisions a VM and runs setup plus validation scripts for real runs", async () => {
        const { service, calls, updates } = makeService();

        await service.executeBuildRun({
            jobId: "job-1",
            config: { dry_run: false, ciuser: "student", cipassword: "secret" } as any,
            authorizationHeader: "Bearer token",
            userSnapshot: { _id: "user-1", role: "admin" }
        });

        expect(calls.some((call) => call.method === "provisionAndBootVM")).toBe(true);
        expect(calls.filter((call) => call.method === "uploadAndRunScript").map((call) => (call.args[0] as any).scriptName)).toEqual([
            "setup.sh",
            "validation.sh"
        ]);
        expect(updates).toEqual(expect.arrayContaining([
            expect.objectContaining({ update: expect.objectContaining({ setup_exit_code: 0 }) }),
            expect.objectContaining({ update: expect.objectContaining({ validation_exit_code: 0 }) })
        ]));
    });

    it("uses reference fallback files when opencode fails and fallback content is available", async () => {
        const { service, calls, latestJob } = makeService({
            opencodeExit: 1,
            fallbackWritten: true
        });

        await service.executeBuildRun({
            jobId: "job-1",
            config: { dry_run: true } as any,
            authorizationHeader: "",
            userSnapshot: { _id: "user-1", role: "admin" }
        });

        expect(calls).toContainEqual({
            method: "writeReferenceFallbackFiles",
            args: ["/tmp/ai-box-build/job-1", "opencode run failed with exit code 1"]
        });
        expect(latestJob.execution_status).toBe(AIBoxBuildExecutionStatus.ready_for_review);
    });

    it("persists a failure when setup execution fails", async () => {
        const { service, updates } = makeService({ setupExit: 2 });

        await service.executeBuildRun({
            jobId: "job-1",
            config: { dry_run: false, ciuser: "student", cipassword: "secret" } as any,
            authorizationHeader: "Bearer token",
            userSnapshot: { _id: "user-1", role: "admin" }
        });

        expect(updates).toEqual(expect.arrayContaining([
            expect.objectContaining({
                update: expect.objectContaining({
                    execution_status: AIBoxBuildExecutionStatus.failed,
                    status: AIBoxBuildJobStatus.failed,
                    error_message: "setup.sh failed with exit code 2"
                })
            })
        ]));
    });
});
