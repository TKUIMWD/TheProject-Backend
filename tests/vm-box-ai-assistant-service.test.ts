import { describe, expect, it } from "vitest";
import Roles from "../src/enum/role";
import { SubmittedBoxStatus } from "../src/interfaces/SubmittedBox";
import { VMBoxAiAssistantService } from "../src/modules/vm-box/VMBoxAiAssistantService";

const userId = "507f1f77bcf86cd7994390e1";
const otherUserId = "507f1f77bcf86cd7994390e2";
const boxId = "507f1f77bcf86cd7994390e3";
const submissionId = "507f1f77bcf86cd7994390e4";
const now = new Date("2026-05-26T00:00:00.000Z");

function makeUser(overrides: Record<string, unknown> = {}) {
    return {
        _id: userId,
        username: "owner",
        email: "owner@example.com",
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

function makeBox(overrides: Record<string, unknown> = {}) {
    const box = {
        _id: boxId,
        submitter_user_id: userId,
        submitted_box_id: submissionId,
        allow_ai_assistant: true,
        updated_date: new Date("2026-05-25T00:00:00.000Z"),
        save: async () => box,
        ...overrides
    } as any;
    return box;
}

function makeSubmission(overrides: Record<string, unknown> = {}) {
    const submission = {
        _id: submissionId,
        submitter_user_id: userId,
        status: SubmittedBoxStatus.not_approved,
        allow_ai_assistant: true,
        status_updated_date: new Date("2026-05-25T00:00:00.000Z"),
        save: async () => submission,
        ...overrides
    } as any;
    return submission;
}

function makeService(options: {
    box?: any | null;
    submission?: any | null;
    publishedBox?: any | null;
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const service = new VMBoxAiAssistantService({
        now: () => new Date(now),
        boxRepo: {
            findById: async (id) => {
                calls.push({ method: "findById", args: [id] });
                return options.box === undefined ? makeBox() : options.box;
            },
            findPublishedForSubmission: async (submission) => {
                calls.push({ method: "findPublishedForSubmission", args: [submission._id] });
                return options.publishedBox === undefined ? makeBox({ submitted_box_id: undefined }) : options.publishedBox;
            }
        },
        submissionRepo: {
            findById: async (id) => {
                calls.push({ method: "findSubmissionById", args: [id] });
                return options.submission === undefined ? makeSubmission() : options.submission;
            },
            updateAiAssistantSetting: async (id, allowAiAssistant, updateDate) => {
                calls.push({ method: "updateAiAssistantSetting", args: [id, allowAiAssistant, updateDate] });
            }
        }
    });

    return { calls, service };
}

describe("VMBoxAiAssistantService", () => {
    it("updates a published box and synchronizes its submitted box setting", async () => {
        const box = makeBox();
        const { service, calls } = makeService({ box });

        await expect(service.updateSetting({
            user: makeUser(),
            request: {
                box_id: boxId,
                allow_ai_assistant: false
            }
        })).resolves.toMatchObject({
            code: 200,
            message: "Box AI assistant setting updated",
            body: {
                box_id: boxId,
                submission_id: submissionId,
                allow_ai_assistant: false
            }
        });

        expect(box.allow_ai_assistant).toBe(false);
        expect(box.updated_date).toEqual(now);
        expect(calls).toContainEqual({
            method: "updateAiAssistantSetting",
            args: [submissionId, false, now]
        });
    });

    it("rejects published box updates from non-owners", async () => {
        const { service, calls } = makeService();

        await expect(service.updateSetting({
            user: makeUser({ _id: otherUserId }),
            request: {
                box_id: boxId,
                allow_ai_assistant: false
            }
        })).resolves.toMatchObject({
            code: 403,
            message: "You do not have permission to update this box"
        });
        expect(calls.some((call) => call.method === "updateAiAssistantSetting")).toBe(false);
    });

    it("updates an approved submitted box and links the published box", async () => {
        const submission = makeSubmission({ status: SubmittedBoxStatus.approved });
        const publishedBox = makeBox({ submitted_box_id: undefined });
        const { service, calls } = makeService({ submission, publishedBox });

        await expect(service.updateSetting({
            user: makeUser(),
            request: {
                submission_id: submissionId,
                allow_ai_assistant: false
            }
        })).resolves.toMatchObject({
            code: 200,
            message: "Box AI assistant setting updated",
            body: {
                submission_id: submissionId,
                box_id: boxId,
                allow_ai_assistant: false
            }
        });

        expect(submission.allow_ai_assistant).toBe(false);
        expect(publishedBox.allow_ai_assistant).toBe(false);
        expect(publishedBox.submitted_box_id).toBe(submissionId);
        expect(calls).toContainEqual({
            method: "findPublishedForSubmission",
            args: [submissionId]
        });
    });

    it("updates a pending submitted box without looking for a published box", async () => {
        const submission = makeSubmission({ status: SubmittedBoxStatus.not_approved });
        const { service, calls } = makeService({ submission });

        await expect(service.updateSetting({
            user: makeUser(),
            request: {
                submission_id: submissionId,
                allow_ai_assistant: false
            }
        })).resolves.toMatchObject({
            code: 200,
            message: "Submitted box AI assistant setting updated",
            body: {
                submission_id: submissionId,
                allow_ai_assistant: false
            }
        });
        expect(calls.some((call) => call.method === "findPublishedForSubmission")).toBe(false);
    });
});
