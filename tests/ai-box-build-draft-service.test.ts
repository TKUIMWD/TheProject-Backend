import { describe, expect, it } from "vitest";
import Roles from "../src/enum/role";
import { AIBoxBuildJobStatus } from "../src/interfaces/AIBoxBuildJob";
import { AIBoxBuildDraftService } from "../src/modules/ai-box-build/AIBoxBuildDraftService";

const userId = "507f1f77bcf86cd7994390c1";
const otherUserId = "507f1f77bcf86cd7994390c2";
const jobId = "507f1f77bcf86cd7994390c3";
const now = new Date("2026-05-26T00:00:00.000Z");

const parsedDraft = {
    phase: "design",
    summary: "Draft ready",
    current_understanding: ["Build a safe CTF VM"],
    open_questions: [],
    risks: ["Keep secrets out"],
    next_actions: ["Review artifacts"],
    artifacts: {
        design_md: "# Design\nUse Ubuntu 24.04 LTS and create a web challenge.",
        setup_md: "# Setup\nInstall nginx and configure the vulnerable app.",
        writeup_md: "# Writeup\nExplain the intended exploit path."
    }
};

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
        requester_role: Roles.Admin,
        direction: "Build a safe web security training VM",
        constraints: "",
        allow_ai_assistant: true,
        status: AIBoxBuildJobStatus.awaiting_review,
        phase: "design",
        summary: "",
        current_understanding: [],
        open_questions: [],
        risks: [],
        next_actions: [],
        artifacts: parsedDraft.artifacts,
        validation_report: undefined,
        messages: [],
        error_message: "",
        save: async function () {
            return this;
        },
        ...overrides
    } as any;
}

function makeService(options: {
    job?: any | null;
    initialError?: Error;
    updateError?: Error;
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const service = new AIBoxBuildDraftService({
        latestUbuntuServer: "24.04",
        now: () => new Date(now),
        agentService: {
            runInitialAgent: async (direction, constraints, allowAiAssistant) => {
                calls.push({ method: "runInitialAgent", args: [direction, constraints, allowAiAssistant] });
                if (options.initialError) throw options.initialError;
                return parsedDraft;
            },
            runJobUpdate: async (job, message) => {
                calls.push({ method: "runJobUpdate", args: [job._id, message] });
                if (options.updateError) throw options.updateError;
                return {
                    ...parsedDraft,
                    summary: "Updated draft",
                    next_actions: ["Run provisioning"]
                };
            }
        },
        jobRepo: {
            createJob: async (payload) => {
                calls.push({ method: "createJob", args: [payload] });
                return {
                    ...(payload as Record<string, unknown>),
                    _id: jobId
                };
            },
            findById: async (id) => {
                calls.push({ method: "findById", args: [id] });
                return options.job === undefined ? makeJob() : options.job;
            }
        }
    });

    return { calls, service };
}

describe("AIBoxBuildDraftService", () => {
    it("creates a draft job from an agent response", async () => {
        const { service, calls } = makeService();

        await expect(service.createJob({
            user: makeUser(),
            request: {
                direction: "Build a safe web security training VM",
                constraints: "Use Ubuntu",
                allow_ai_assistant: false
            }
        })).resolves.toMatchObject({
            code: 200,
            message: "AI box build job created",
            body: {
                _id: jobId,
                requester_user_id: userId,
                allow_ai_assistant: false,
                summary: "Draft ready"
            }
        });

        expect(calls[0]).toEqual({
            method: "runInitialAgent",
            args: ["Build a safe web security training VM", "Use Ubuntu", false]
        });
        expect(calls[1].method).toBe("createJob");
        expect((calls[1].args[0] as any).messages).toHaveLength(2);
    });

    it("stores a failed draft when the initial agent fails", async () => {
        const { service } = makeService({
            initialError: new Error("model unavailable")
        });

        await expect(service.createJob({
            user: makeUser(),
            request: {
                direction: "Build a safe web security training VM"
            }
        })).resolves.toMatchObject({
            code: 200,
            body: {
                status: AIBoxBuildJobStatus.failed,
                error_message: expect.stringContaining("model unavailable")
            }
        });
    });

    it("updates a draft job with a user message and regenerated artifacts", async () => {
        const job = makeJob();
        const { service, calls } = makeService({ job });

        await expect(service.addMessage({
            user: makeUser(),
            jobId,
            request: { message: "Make the writeup clearer" }
        })).resolves.toMatchObject({
            code: 200,
            message: "AI box build job updated",
            body: {
                _id: jobId,
                summary: "Updated draft",
                messages: expect.any(Array)
            }
        });

        expect(calls).toContainEqual({
            method: "runJobUpdate",
            args: [jobId, "Make the writeup clearer"]
        });
        expect(job.messages).toHaveLength(2);
        expect(job.next_actions).toEqual(expect.arrayContaining(["Run provisioning"]));
    });

    it("rejects draft updates from users who do not own the job", async () => {
        const { service, calls } = makeService({
            job: makeJob({ requester_user_id: otherUserId })
        });

        await expect(service.addMessage({
            user: makeUser(),
            jobId,
            request: { message: "Try updating it" }
        })).resolves.toMatchObject({
            code: 403,
            message: "You do not have permission to update this job"
        });
        expect(calls.some((call) => call.method === "runJobUpdate")).toBe(false);
    });
});
