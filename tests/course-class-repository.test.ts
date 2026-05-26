import { describe, expect, it } from "vitest";
import { CourseClassRepository } from "../src/modules/courses/CourseClassRepository";

function makeRepository() {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const classDoc = {
        _id: "class-1",
        chapter_ids: ["chapter-1"]
    };

    const makeQuery = () => ({
        select: (fields: string) => {
            calls.push({ method: "select", args: [fields] });
            return {
                lean: () => {
                    calls.push({ method: "lean", args: [] });
                    return {
                        exec: async () => [classDoc]
                    };
                },
                exec: async () => [classDoc]
            };
        },
        lean: () => {
            calls.push({ method: "lean", args: [] });
            return {
                exec: async () => [classDoc]
            };
        },
        exec: async () => [classDoc]
    });

    const model = {
        find: (query: unknown) => {
            calls.push({ method: "find", args: [query] });
            return makeQuery();
        },
        deleteMany: (query: unknown) => {
            calls.push({ method: "deleteMany", args: [query] });
            return {
                exec: async () => ({ deletedCount: 1 })
            };
        }
    };

    return {
        calls,
        repository: new CourseClassRepository(model as any)
    };
}

describe("CourseClassRepository", () => {
    it("lists classes by IDs", async () => {
        const { repository, calls } = makeRepository();

        await repository.listByIds(["class-1"], { lean: true });

        expect(calls).toEqual([
            { method: "find", args: [{ _id: { $in: ["class-1"] } }] },
            { method: "lean", args: [] }
        ]);
    });

    it("skips empty class ID lookups", async () => {
        const { repository, calls } = makeRepository();

        await expect(repository.listByIds([], { lean: true })).resolves.toEqual([]);

        expect(calls).toEqual([]);
    });

    it("lists class chapter refs by IDs", async () => {
        const { repository, calls } = makeRepository();

        await repository.listChapterRefsByIds(["class-1"]);

        expect(calls).toEqual([
            { method: "find", args: [{ _id: { $in: ["class-1"] } }] },
            { method: "select", args: ["chapter_ids"] },
            { method: "lean", args: [] }
        ]);
    });

    it("deletes classes by IDs", async () => {
        const { repository, calls } = makeRepository();

        await repository.deleteByIds(["class-1"]);

        expect(calls).toEqual([
            { method: "deleteMany", args: [{ _id: { $in: ["class-1"] } }] }
        ]);
    });

    it("skips empty delete operations", async () => {
        const { repository, calls } = makeRepository();

        await expect(repository.deleteByIds([])).resolves.toEqual({ deletedCount: 0 });

        expect(calls).toEqual([]);
    });
});
