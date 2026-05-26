import { describe, expect, it } from "vitest";
import { SubmittedBoxStatus } from "../src/interfaces/SubmittedBox";
import { VMBoxListService } from "../src/modules/vm-box/VMBoxListService";

const submittedDate = new Date("2026-05-26T00:00:00.000Z");

const templateInfo = {
    name: "Template One",
    description: "Template description",
    default_cpu_cores: 2,
    default_memory_size: 2048,
    default_disk_size: 20,
    owner: "owner@example.test"
};

function makeSubmission(overrides: Record<string, unknown> = {}) {
    return {
        _id: { toString: () => "submission-1" },
        vmtemplate_id: "template-1",
        submitter_user_id: "user-1",
        submitted_date: submittedDate,
        status_updated_date: submittedDate,
        status: SubmittedBoxStatus.not_approved,
        box_setup_description: "Setup",
        flag_answers: { user: "flag{user}" },
        allow_ai_assistant: true,
        ...overrides
    };
}

function makePublicBox(overrides: Record<string, unknown> = {}) {
    return {
        _id: { toString: () => "box-1" },
        vmtemplate_id: "template-1",
        submitter_user_id: "user-1",
        submitted_date: submittedDate,
        updated_date: submittedDate,
        is_public: true,
        box_setup_description: "Setup",
        flag_answers: { user: "flag{user}", root: "flag{root}" },
        rating_score: 4.5,
        review_count: 2,
        ...overrides
    };
}

function makeService(options: {
    submissions?: any[];
    pending?: any[];
    publicBoxes?: any[];
    publishedBoxes?: any[];
    templates?: any[];
    users?: any[];
    writeupCounts?: any[];
} = {}) {
    const calls: Array<{ target: string; method: string; args: unknown[] }> = [];
    const submissions = {
        listAllNewestFirst: async () => {
            calls.push({ target: "submissions", method: "listAllNewestFirst", args: [] });
            return options.submissions ?? [];
        },
        listByStatus: async (status: SubmittedBoxStatus) => {
            calls.push({ target: "submissions", method: "listByStatus", args: [status] });
            return options.pending ?? [];
        }
    };
    const boxes = {
        listPublicBoxes: async () => {
            calls.push({ target: "boxes", method: "listPublicBoxes", args: [] });
            return options.publicBoxes ?? [];
        },
        listPublishedForSubmissions: async (approvedSubmissions: any[]) => {
            calls.push({ target: "boxes", method: "listPublishedForSubmissions", args: [approvedSubmissions] });
            return options.publishedBoxes ?? [];
        }
    };
    const templates = {
        listByIds: async (templateIds: string[]) => {
            calls.push({ target: "templates", method: "listByIds", args: [templateIds] });
            return options.templates ?? [{ _id: "template-1", owner: "template-owner" }];
        }
    };
    const users = {
        listByIds: async (userIds: string[], queryOptions?: unknown) => {
            calls.push({ target: "users", method: "listByIds", args: [userIds, queryOptions] });
            return options.users ?? [{ _id: "user-1", username: "teacher", email: "teacher@example.test" }];
        }
    };
    const writeups = {
        listPublicWriteupCounts: async (boxIds: string[]) => {
            calls.push({ target: "writeups", method: "listPublicWriteupCounts", args: [boxIds] });
            return options.writeupCounts ?? [];
        }
    };
    const resolveTemplateInfo = async (...args: any[]) => {
        calls.push({ target: "templateInfo", method: "resolve", args });
        return templateInfo;
    };

    return {
        calls,
        service: new VMBoxListService({
            submissions,
            boxes,
            templates,
            users,
            writeups,
            resolveTemplateInfo
        })
    };
}

describe("VMBoxListService", () => {
    it("lists submitted boxes with published approval metadata", async () => {
        const approvedSubmission = makeSubmission({ status: SubmittedBoxStatus.approved });
        const { service, calls } = makeService({
            submissions: [approvedSubmission],
            publishedBoxes: [
                makePublicBox({
                    _id: { toString: () => "published-1" },
                    submitted_box_id: "submission-1"
                })
            ]
        });

        await expect(service.listSubmittedBoxes()).resolves.toMatchObject({
            code: 200,
            message: "Submitted boxes fetched successfully",
            body: [
                {
                    submitted_box_id: "submission-1",
                    published_box_id: "published-1",
                    name: "Template One",
                    is_public: true,
                    status: SubmittedBoxStatus.approved,
                    submitter_user_info: {
                        username: "teacher",
                        email: "teacher@example.test"
                    }
                }
            ]
        });
        expect(calls.map(call => `${call.target}.${call.method}`)).toContain("boxes.listPublishedForSubmissions");
    });

    it("lists public boxes with writeup counts", async () => {
        const { service } = makeService({
            publicBoxes: [makePublicBox()],
            writeupCounts: [{ _id: "box-1", count: 3 }]
        });

        await expect(service.listPublicBoxes()).resolves.toMatchObject({
            code: 200,
            message: "Public boxes fetched successfully",
            body: [
                {
                    name: "Template One",
                    flag_count: 2,
                    public_writeup_count: 3,
                    submitter_user_info: {
                        username: "teacher"
                    }
                }
            ]
        });
    });

    it("lists pending submissions with template owner fallback enabled", async () => {
        const { service, calls } = makeService({
            pending: [makeSubmission()]
        });

        await expect(service.listPendingBoxes()).resolves.toMatchObject({
            code: 200,
            message: "Pending boxes fetched successfully",
            body: [
                {
                    name: "Template One",
                    is_public: false
                }
            ]
        });

        expect(calls).toContainEqual({
            target: "templateInfo",
            method: "resolve",
            args: [
                { _id: "template-1", owner: "template-owner" },
                "Setup",
                { useTemplateOwnerOnError: true }
            ]
        });
    });

    it("returns empty success responses for empty lists", async () => {
        const { service } = makeService();

        await expect(service.listSubmittedBoxes()).resolves.toEqual({
            code: 200,
            message: "No submitted boxes found",
            body: []
        });
        await expect(service.listPublicBoxes()).resolves.toEqual({
            code: 200,
            message: "No public boxes found",
            body: []
        });
        await expect(service.listPendingBoxes()).resolves.toEqual({
            code: 200,
            message: "No pending boxes found",
            body: []
        });
    });
});
