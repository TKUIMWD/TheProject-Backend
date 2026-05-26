import { describe, expect, it } from "vitest";
import Roles from "../src/enum/role";
import { AIBoxBuildExecutionStatus, AIBoxBuildJobStatus } from "../src/interfaces/AIBoxBuildJob";
import { AIBoxBuildJobManagementService } from "../src/modules/ai-box-build/AIBoxBuildJobManagementService";

const jobId = "507f1f77bcf86cd7994390a1";
const userId = "507f1f77bcf86cd7994390a2";

function makeUser(overrides: Record<string, unknown> = {}) {
    return {
        _id: userId,
        username: "builder",
        email: "builder@example.com",
        role: Roles.Admin,
        course_ids: [],
        owned_vms: [],
        owned_templates: [],
        password_hash: "",
        isVerified: true,
        compute_resource_plan_id: "",
        used_compute_resource_id: "",
        ...overrides
    } as any;
}

function makeJob(overrides: Record<string, unknown> = {}) {
    return {
        _id: jobId,
        requester_user_id: userId,
        direction: "Build a web security training box",
        constraints: "",
        allow_ai_assistant: true,
        status: AIBoxBuildJobStatus.awaiting_review,
        execution_status: AIBoxBuildExecutionStatus.idle,
        artifacts: {},
        messages: [],
        run_logs: [],
        save: async function () {
            return this;
        },
        ...overrides
    } as any;
}

function makeService(options: {
    jobs?: any[];
    job?: any | null;
    limitedJobs?: any[];
    runningJobs?: Set<string>;
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const service = new AIBoxBuildJobManagementService({
        runningJobs: options.runningJobs ?? new Set<string>(),
        staleAfterMs: 60_000,
        now: () => new Date("2026-05-26T00:00:00.000Z"),
        jobRepo: {
            listRecentJobs: async (query, limit) => {
                calls.push({ method: "listRecentJobs", args: [query, limit] });
                return options.jobs ?? [makeJob()];
            },
            findById: async (id) => {
                calls.push({ method: "findById", args: [id] });
                return options.job === undefined ? makeJob() : options.job;
            },
            deleteById: async (id) => {
                calls.push({ method: "deleteById", args: [id] });
                return { deletedCount: 1 };
            },
            findLimited: async (query, limit) => {
                calls.push({ method: "findLimited", args: [query, limit] });
                return options.limitedJobs ?? [];
            },
            updateMany: async (query, update) => {
                calls.push({ method: "updateMany", args: [query, update] });
                return { modifiedCount: 1 };
            }
        },
        workspaceService: {
            deleteJobWorkspace: async (id, workspacePath) => {
                calls.push({ method: "deleteJobWorkspace", args: [id, workspacePath] });
            }
        }
    });

    return { calls, service };
}

describe("AIBoxBuildJobManagementService", () => {
    it("lists only the actor's jobs for admins and marks stale jobs first", async () => {
        const staleJob = makeJob({
            _id: "507f1f77bcf86cd7994390a3",
            execution_status: AIBoxBuildExecutionStatus.configuring,
            updated_at: new Date("2026-05-25T23:58:00.000Z")
        });
        const { service, calls } = makeService({ limitedJobs: [staleJob] });

        await expect(service.listJobs(makeUser())).resolves.toMatchObject({
            code: 200,
            message: "AI box build jobs fetched",
            body: [expect.objectContaining({ _id: jobId })]
        });

        expect(calls[0].method).toBe("findLimited");
        expect(calls).toContainEqual({
            method: "listRecentJobs",
            args: [{ requester_user_id: userId }, 50]
        });
        expect(calls.some((call) => call.method === "updateMany")).toBe(true);
    });

    it("fetches a job when the actor can access it", async () => {
        const { service } = makeService();

        await expect(service.getJob({
            user: makeUser(),
            jobId
        })).resolves.toMatchObject({
            code: 200,
            message: "AI box build job fetched",
            body: { _id: jobId }
        });
    });

    it("deletes a job workspace and record when the job is idle", async () => {
        const { service, calls } = makeService({
            job: makeJob({ workspace_path: "/tmp/ai-box-build/job" })
        });

        await expect(service.deleteJob({
            user: makeUser(),
            jobId
        })).resolves.toMatchObject({
            code: 200,
            message: "AI box build job deleted",
            body: {
                deleted_job_id: jobId,
                workspace_path: "/tmp/ai-box-build/job",
                workspace_deleted: true
            }
        });
        expect(calls.map((call) => call.method)).toContain("deleteJobWorkspace");
        expect(calls.map((call) => call.method)).toContain("deleteById");
    });

    it("blocks deletion for running jobs", async () => {
        const { service, calls } = makeService({
            runningJobs: new Set([jobId])
        });

        await expect(service.deleteJob({
            user: makeUser(),
            jobId
        })).resolves.toMatchObject({
            code: 409,
            message: "AI build job is running; stop or wait for it to finish before deleting"
        });
        expect(calls.some((call) => call.method === "deleteById")).toBe(false);
    });

    it("updates status unless validation is blocked", async () => {
        const job = makeJob();
        const { service } = makeService({ job });

        await expect(service.updateStatus({
            user: makeUser(),
            jobId,
            status: AIBoxBuildJobStatus.approved
        })).resolves.toMatchObject({
            code: 200,
            message: "AI box build job status updated",
            body: { status: AIBoxBuildJobStatus.approved }
        });
        expect(job.status).toBe(AIBoxBuildJobStatus.approved);
    });
});
