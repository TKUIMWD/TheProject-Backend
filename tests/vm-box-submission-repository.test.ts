import { describe, expect, it } from "vitest";
import { SubmittedBoxStatus } from "../src/interfaces/SubmittedBox";
import { VMBoxSubmissionRepository } from "../src/modules/vm-box/VMBoxSubmissionRepository";

function makeRepository() {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const submission = {
        _id: "submission-1",
        status: SubmittedBoxStatus.not_approved,
        submitted_date: new Date("2026-05-26T00:00:00.000Z"),
        save: async () => submission
    };

    const makeFindQuery = (result: any[]) => ({
        sort: (sort: unknown) => {
            calls.push({ method: "sort", args: [sort] });
            return {
                exec: async () => result
            };
        },
        exec: async () => result
    });

    const model = {
        createDocument: (payload: unknown) => {
            calls.push({ method: "createDocument", args: [payload] });
            return submission;
        },
        find: (query?: unknown) => {
            calls.push({ method: "find", args: query === undefined ? [] : [query] });
            return makeFindQuery([submission]);
        },
        findById: (id: string) => {
            calls.push({ method: "findById", args: [id] });
            return {
                exec: async () => submission
            };
        },
        updateOne: (query: unknown, update: unknown) => {
            calls.push({ method: "updateOne", args: [query, update] });
            return {
                exec: async () => ({ acknowledged: true, matchedCount: 1, modifiedCount: 1 } as any)
            };
        }
    };

    return {
        calls,
        repository: new VMBoxSubmissionRepository(model as any)
    };
}

describe("VMBoxSubmissionRepository", () => {
    it("creates submitted-box documents", () => {
        const { repository, calls } = makeRepository();
        const payload = { vmtemplate_id: "template-1" };

        expect(repository.createSubmissionDocument(payload)).toMatchObject({
            _id: "submission-1"
        });

        expect(calls).toEqual([
            { method: "createDocument", args: [payload] }
        ]);
    });

    it("lists all submitted boxes newest first", async () => {
        const { repository, calls } = makeRepository();

        await expect(repository.listAllNewestFirst()).resolves.toHaveLength(1);

        expect(calls).toEqual([
            { method: "find", args: [] },
            { method: "sort", args: [{ submitted_date: -1 }] }
        ]);
    });

    it("lists submitted boxes by status", async () => {
        const { repository, calls } = makeRepository();

        await repository.listByStatus(SubmittedBoxStatus.not_approved);

        expect(calls).toEqual([
            { method: "find", args: [{ status: SubmittedBoxStatus.not_approved }] }
        ]);
    });

    it("finds submitted boxes by ID", async () => {
        const { repository, calls } = makeRepository();

        await repository.findById("submission-1");

        expect(calls).toEqual([
            { method: "findById", args: ["submission-1"] }
        ]);
    });

    it("updates submitted-box AI assistant settings", async () => {
        const { repository, calls } = makeRepository();
        const now = new Date("2026-05-26T01:00:00.000Z");

        await repository.updateAiAssistantSetting("submission-1", false, now);

        expect(calls).toEqual([
            {
                method: "updateOne",
                args: [
                    { _id: "submission-1" },
                    { $set: { allow_ai_assistant: false, status_updated_date: now } }
                ]
            }
        ]);
    });
});
