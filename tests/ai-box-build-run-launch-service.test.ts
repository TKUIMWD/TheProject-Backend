import { describe, expect, it } from "vitest";
import Roles from "../src/enum/role";
import {
    AIBoxBuildExecutionStatus,
    AIBoxBuildJobStatus,
    AIBoxBuildPhase
} from "../src/interfaces/AIBoxBuildJob";
import { AIBoxBuildRunLaunchService } from "../src/modules/ai-box-build/AIBoxBuildRunLaunchService";

const userId = "507f1f77bcf86cd799439901";
const otherUserId = "507f1f77bcf86cd799439902";
const jobId = "507f1f77bcf86cd799439903";
const templateId = "507f1f77bcf86cd799439904";

function makeUser(overrides: Record<string, unknown> = {}) {
    return {
        _id: userId,
        username: "alice",
        email: "alice@example.test",
        role: Roles.Admin,
        password_hash: "",
        isVerified: true,
        compute_resource_plan_id: "",
        used_compute_resource_id: "",
        course_ids: [],
        owned_vms: [],
        owned_templates: [],
        ...overrides
    } as any;
}

function text(seed: string, repeat = 90) {
    return Array.from({ length: repeat }, (_, index) => `${seed} ${index}`).join(". ");
}

function makeArtifacts(overrides: Record<string, unknown> = {}) {
    return {
        design_md: text("Learning objective service map intended attack path credential flag AI assistant context"),
        setup_md: text("apt install nginx systemctl enable service useradd chmod mkdir curl setup command validation check writes flag to /root/flag.txt and /home/student/user.txt"),
        writeup_md: text("Student writeup enumeration exploitation privilege escalation final flag capture from /root/flag.txt", 70),
        ...overrides
    };
}

function makeJob(overrides: Record<string, unknown> = {}) {
    return {
        _id: jobId,
        requester_user_id: userId,
        requester_role: Roles.Admin,
        direction: "Build a Linux web CTF machine.",
        constraints: "",
        allow_ai_assistant: true,
        status: AIBoxBuildJobStatus.awaiting_review,
        phase: AIBoxBuildPhase.design,
        summary: "summary",
        current_understanding: [],
        open_questions: [],
        risks: [],
        next_actions: [],
        artifacts: makeArtifacts(),
        validation_report: undefined,
        messages: [],
        execution_status: AIBoxBuildExecutionStatus.idle,
        provisioning: {},
        run_logs: [],
        created_at: new Date("2026-01-01T00:00:00.000Z"),
        updated_at: new Date("2026-01-01T00:00:00.000Z"),
        save: async function () {
            return this;
        },
        ...overrides
    } as any;
}

function makeRunBody(overrides: Record<string, unknown> = {}) {
    return {
        template_id: templateId,
        target: "pve-a",
        name: "blue-lab",
        cpuCores: 2,
        memorySize: 2048,
        diskSize: 20,
        ciuser: "student",
        cipassword: "secret",
        ...overrides
    };
}

function makeService(options: {
    job?: any | null;
    queuedJob?: any | null;
    latestJob?: any | null;
    staleJobs?: any[];
    preflightResp?: any;
    runningJobs?: Set<string>;
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const runningJobs = options.runningJobs ?? new Set<string>();
    const service = new AIBoxBuildRunLaunchService({
        runningJobs,
        config: {
            blockedTargetNodes: ["blocked-node"],
            staleAfterMs: 30 * 60 * 1000,
            latestUbuntuServer: "24.04"
        },
        jobs: {
            findById: async (...args) => {
                calls.push({ method: "findById", args });
                const id = args[0];
                if (id === jobId) {
                    return options.job === undefined ? makeJob() : options.job;
                }
                return options.latestJob === undefined ? makeJob() : options.latestJob;
            },
            findOneAndUpdate: async (...args) => {
                calls.push({ method: "findOneAndUpdate", args });
                return options.queuedJob === undefined ? makeJob({ execution_status: AIBoxBuildExecutionStatus.provisioning }) : options.queuedJob;
            },
            findLimited: async (...args) => {
                calls.push({ method: "findLimited", args });
                return options.staleJobs ?? [];
            },
            updateMany: async (...args) => {
                calls.push({ method: "updateMany", args });
            }
        },
        runtimePreflight: {
            validateRuntimePreflight: async (...args) => {
                calls.push({ method: "validateRuntimePreflight", args });
                return options.preflightResp;
            }
        },
        runExecution: {
            executeBuildRun: async (...args) => {
                calls.push({ method: "executeBuildRun", args });
                return new Promise(() => undefined);
            }
        }
    });

    return { calls, runningJobs, service };
}

describe("AIBoxBuildRunLaunchService", () => {
    it("rejects invalid job IDs before stale cleanup", async () => {
        const { service, calls } = makeService();

        await expect(service.launch({
            user: makeUser(),
            jobId: "bad-id",
            body: makeRunBody(),
            authorizationHeader: "Bearer token"
        })).resolves.toEqual({
            code: 400,
            message: "Invalid job_id format",
            body: undefined
        });

        expect(calls).toEqual([]);
    });

    it("marks stale active jobs before loading the requested job", async () => {
        const staleJob = makeJob({
            _id: jobId,
            execution_status: AIBoxBuildExecutionStatus.provisioning,
            updated_at: new Date("2020-01-01T00:00:00.000Z")
        });
        const { service, calls } = makeService({ staleJobs: [staleJob] });

        await service.launch({
            user: makeUser(),
            jobId,
            body: makeRunBody(),
            authorizationHeader: "Bearer token"
        });

        expect(calls.map((call) => call.method).slice(0, 3)).toEqual([
            "findLimited",
            "updateMany",
            "findById"
        ]);
    });

    it("blocks users who do not own the job", async () => {
        const { service, calls } = makeService({
            job: makeJob({ requester_user_id: otherUserId })
        });

        await expect(service.launch({
            user: makeUser(),
            jobId,
            body: makeRunBody(),
            authorizationHeader: ""
        })).resolves.toMatchObject({
            code: 403,
            message: "You do not have permission to run this job"
        });

        expect(calls.map((call) => call.method)).not.toContain("findOneAndUpdate");
    });

    it("returns run request validation errors before runtime preflight", async () => {
        const { service, calls } = makeService();

        await expect(service.launch({
            user: makeUser(),
            jobId,
            body: makeRunBody({ target: "blocked-node" }),
            authorizationHeader: ""
        })).resolves.toEqual({
            code: 400,
            message: "target node blocked-node is blocked for AI box builds",
            body: undefined
        });

        expect(calls.map((call) => call.method)).not.toContain("validateRuntimePreflight");
    });

    it("persists validation-blocked state when artifacts are incomplete", async () => {
        let saved = false;
        const blockedJob = makeJob({
            artifacts: makeArtifacts({ setup_md: "" }),
            save: async function () {
                saved = true;
                return this;
            }
        });
        const { service, calls } = makeService({ job: blockedJob });

        await expect(service.launch({
            user: makeUser(),
            jobId,
            body: makeRunBody(),
            authorizationHeader: ""
        })).resolves.toMatchObject({
            code: 400,
            message: "AI build artifacts are blocked; regenerate or fix design.md/setup.md/writeup.md before starting a run"
        });

        expect(saved).toBe(true);
        expect(blockedJob.execution_status).toBe(AIBoxBuildExecutionStatus.failed);
        expect(calls.map((call) => call.method)).not.toContain("findOneAndUpdate");
    });

    it("returns runtime preflight responses before queueing", async () => {
        const { service, calls } = makeService({
            preflightResp: { code: 409, message: "runtime busy", body: undefined }
        });

        await expect(service.launch({
            user: makeUser(),
            jobId,
            body: makeRunBody(),
            authorizationHeader: ""
        })).resolves.toEqual({
            code: 409,
            message: "runtime busy",
            body: undefined
        });

        expect(calls.map((call) => call.method)).not.toContain("findOneAndUpdate");
    });

    it("queues valid jobs and starts background execution", async () => {
        const { service, calls, runningJobs } = makeService();

        await expect(service.launch({
            user: makeUser(),
            jobId,
            body: makeRunBody(),
            authorizationHeader: "Bearer token"
        })).resolves.toMatchObject({
            code: 202,
            message: "AI box build run started",
            body: {
                _id: jobId,
                execution_status: AIBoxBuildExecutionStatus.provisioning
            }
        });

        expect(calls.map((call) => call.method)).toContain("findOneAndUpdate");
        const executionInput = calls.find((call) => call.method === "executeBuildRun")!.args[0] as any;
        expect(executionInput).toMatchObject({
            jobId,
            authorizationHeader: "Bearer token",
            userSnapshot: {
                _id: userId,
                role: Roles.Admin,
                email: "alice@example.test"
            }
        });
        expect(runningJobs.has(jobId)).toBe(true);
    });
});
