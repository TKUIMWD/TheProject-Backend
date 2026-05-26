import { describe, expect, it } from "vitest";
import { UserRepository } from "../src/modules/users/UserRepository";

function makeRepository() {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const user = {
        _id: "user-1",
        email: "user@example.com",
        username: "User"
    };

    const makeQuery = <T>(result: T) => ({
        lean: () => {
            calls.push({ method: "lean", args: [] });
            return {
                exec: async () => result
            };
        },
        exec: async () => result
    });

    const model = {
        find: (query: unknown) => {
            calls.push({ method: "find", args: [query] });
            return makeQuery([user]);
        },
        findById: (id: string) => {
            calls.push({ method: "findById", args: [id] });
            return makeQuery({ ...user, _id: id });
        },
        findByIdAndUpdate: (id: string, update: unknown) => {
            calls.push({ method: "findByIdAndUpdate", args: [id, update] });
            return {
                exec: async () => ({ ...user, _id: id, ...(update as any) })
            };
        },
        updateMany: (query: unknown, update: unknown) => {
            calls.push({ method: "updateMany", args: [query, update] });
            return {
                exec: async () => ({ acknowledged: true, modifiedCount: 1 })
            };
        }
    };

    return {
        calls,
        repository: new UserRepository(model as any)
    };
}

describe("UserRepository", () => {
    it("lists users by IDs", async () => {
        const { repository, calls } = makeRepository();

        await repository.listByIds(["user-1", "user-2"]);

        expect(calls).toEqual([
            { method: "find", args: [{ _id: { $in: ["user-1", "user-2"] } }] }
        ]);
    });

    it("lists lean users by IDs", async () => {
        const { repository, calls } = makeRepository();

        await repository.listByIds(["user-1"], { lean: true });

        expect(calls).toEqual([
            { method: "find", args: [{ _id: { $in: ["user-1"] } }] },
            { method: "lean", args: [] }
        ]);
    });

    it("skips empty user ID lookups", async () => {
        const { repository, calls } = makeRepository();

        await expect(repository.listByIds([])).resolves.toEqual([]);

        expect(calls).toEqual([]);
    });

    it("finds users by ID", async () => {
        const { repository, calls } = makeRepository();

        await repository.findById("user-1");

        expect(calls).toEqual([
            { method: "findById", args: ["user-1"] }
        ]);
    });

    it("finds lean users by ID", async () => {
        const { repository, calls } = makeRepository();

        await repository.findById("user-1", { lean: true });

        expect(calls).toEqual([
            { method: "findById", args: ["user-1"] },
            { method: "lean", args: [] }
        ]);
    });

    it("lists users by emails", async () => {
        const { repository, calls } = makeRepository();

        await repository.listByEmails(["user@example.com"], { lean: true });

        expect(calls).toEqual([
            { method: "find", args: [{ email: { $in: ["user@example.com"] } }] },
            { method: "lean", args: [] }
        ]);
    });

    it("skips empty email lookups", async () => {
        const { repository, calls } = makeRepository();

        await expect(repository.listByEmails([])).resolves.toEqual([]);

        expect(calls).toEqual([]);
    });

    it("updates user course IDs", async () => {
        const { repository, calls } = makeRepository();

        await repository.updateCourseIds("user-1", ["course-1"]);

        expect(calls).toEqual([
            { method: "findByIdAndUpdate", args: ["user-1", { course_ids: ["course-1"] }] }
        ]);
    });

    it("removes a course from all users", async () => {
        const { repository, calls } = makeRepository();

        await repository.removeCourseFromAllUsers("course-1");

        expect(calls).toEqual([
            {
                method: "updateMany",
                args: [
                    { course_ids: "course-1" },
                    { $pull: { course_ids: "course-1" } }
                ]
            }
        ]);
    });
});
