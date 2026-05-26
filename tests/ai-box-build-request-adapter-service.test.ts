import { describe, expect, it } from "vitest";
import { AIBoxBuildRequestAdapterService } from "../src/modules/ai-box-build/AIBoxBuildRequestAdapterService";

const user = { _id: "507f1f77bcf86cd799439011" } as any;

function makeService() {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const service = new AIBoxBuildRequestAdapterService({
        draft: {
            createJob: async (input) => {
                calls.push({ method: "createJob", args: [input] });
                return { code: 200, message: "ok", body: undefined };
            },
            addMessage: async (input) => {
                calls.push({ method: "addMessage", args: [input] });
                return { code: 200, message: "ok", body: undefined };
            }
        },
        jobManagement: {
            listJobs: async (inputUser) => {
                calls.push({ method: "listJobs", args: [inputUser] });
                return { code: 200, message: "ok", body: [] };
            },
            getJob: async (input) => {
                calls.push({ method: "getJob", args: [input] });
                return { code: 200, message: "ok", body: undefined };
            },
            deleteJob: async (input) => {
                calls.push({ method: "deleteJob", args: [input] });
                return { code: 200, message: "ok", body: { deleted_job_id: "job-1", workspace_deleted: true } };
            },
            updateStatus: async (input) => {
                calls.push({ method: "updateStatus", args: [input] });
                return { code: 200, message: "ok", body: undefined };
            }
        },
        runLaunch: {
            launch: async (input) => {
                calls.push({ method: "launch", args: [input] });
                return { code: 200, message: "ok", body: undefined };
            }
        }
    });

    return { calls, service };
}

describe("AIBoxBuildRequestAdapterService", () => {
    it("maps draft request bodies to draft workflows", async () => {
        const { calls, service } = makeService();
        const body = { prompt: "build a web challenge" };

        await service.createJob({ user, body });
        await service.addMessage({ user, params: { job_id: "job-1" }, body });

        expect(calls).toEqual([
            { method: "createJob", args: [{ user, request: body }] },
            { method: "addMessage", args: [{ user, jobId: "job-1", request: body }] }
        ]);
    });

    it("maps job params and status body to management workflows", async () => {
        const { calls, service } = makeService();

        await service.listJobs({ user });
        await service.getJob({ user, params: { job_id: "job-1" } });
        await service.deleteJob({ user, params: { job_id: "job-1" } });
        await service.updateStatus({ user, params: { job_id: "job-1" }, body: { status: "queued" } });

        expect(calls).toEqual([
            { method: "listJobs", args: [user] },
            { method: "getJob", args: [{ user, jobId: "job-1" }] },
            { method: "deleteJob", args: [{ user, jobId: "job-1" }] },
            { method: "updateStatus", args: [{ user, jobId: "job-1", status: "queued" }] }
        ]);
    });

    it("maps run launch params, body, and authorization header", async () => {
        const { calls, service } = makeService();
        const body = { template_id: "template-1" };

        await service.launchBuildRun({
            user,
            params: { job_id: "job-1" },
            body,
            authorizationHeader: "Bearer token"
        });

        expect(calls).toEqual([
            {
                method: "launch",
                args: [{
                    user,
                    jobId: "job-1",
                    body,
                    authorizationHeader: "Bearer token"
                }]
            }
        ]);
    });
});
