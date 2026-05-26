import { describe, expect, it } from "vitest";
import { CourseChapterRepository } from "../src/modules/courses/CourseChapterRepository";

function makeRepository() {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const chapter = {
        _id: "chapter-1",
        waiting_for_approve_content: "draft"
    };

    const model = {
        find: (query: unknown) => {
            calls.push({ method: "find", args: [query] });
            return {
                lean: () => {
                    calls.push({ method: "lean", args: [] });
                    return {
                        exec: async () => [chapter]
                    };
                },
                exec: async () => [chapter]
            };
        },
        deleteMany: (query: unknown) => {
            calls.push({ method: "deleteMany", args: [query] });
            return {
                exec: async () => ({ deletedCount: 1 })
            };
        },
        updateMany: (query: unknown, update: unknown) => {
            calls.push({ method: "updateMany", args: [query, update] });
            return {
                exec: async () => ({ modifiedCount: 1 })
            };
        }
    };

    return {
        calls,
        repository: new CourseChapterRepository(model as any)
    };
}

describe("CourseChapterRepository", () => {
    it("lists chapters by IDs", async () => {
        const { repository, calls } = makeRepository();

        await repository.listByIds(["chapter-1"], { lean: true });

        expect(calls).toEqual([
            { method: "find", args: [{ _id: { $in: ["chapter-1"] } }] },
            { method: "lean", args: [] }
        ]);
    });

    it("skips empty chapter ID lookups", async () => {
        const { repository, calls } = makeRepository();

        await expect(repository.listByIds([], { lean: true })).resolves.toEqual([]);

        expect(calls).toEqual([]);
    });

    it("deletes chapters by IDs", async () => {
        const { repository, calls } = makeRepository();

        await repository.deleteByIds(["chapter-1"]);

        expect(calls).toEqual([
            { method: "deleteMany", args: [{ _id: { $in: ["chapter-1"] } }] }
        ]);
    });

    it("syncs approved content by chapter IDs", async () => {
        const { repository, calls } = makeRepository();

        await repository.syncApprovedContentByIds(["chapter-1"]);

        expect(calls).toEqual([
            {
                method: "updateMany",
                args: [
                    { _id: { $in: ["chapter-1"] } },
                    [{ $set: { has_approved_content: "$waiting_for_approve_content" } }]
                ]
            }
        ]);
    });

    it("skips empty delete and sync operations", async () => {
        const { repository, calls } = makeRepository();

        await expect(repository.deleteByIds([])).resolves.toEqual({ deletedCount: 0 });
        await expect(repository.syncApprovedContentByIds([])).resolves.toEqual({ modifiedCount: 0 });

        expect(calls).toEqual([]);
    });
});
