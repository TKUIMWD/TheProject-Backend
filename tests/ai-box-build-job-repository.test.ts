import { describe, expect, it } from "vitest";
import { AIBoxBuildJobRepository } from "../src/modules/ai-box-build/AIBoxBuildJobRepository";

function makeRepository() {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const job = { _id: "job-1", direction: "build lab" };

    const makeFindQuery = (result: any[]) => ({
        sort: (sort: unknown) => {
            calls.push({ method: "sort", args: [sort] });
            return makeFindQuery(result);
        },
        limit: (limit: number) => {
            calls.push({ method: "limit", args: [limit] });
            return {
                exec: async () => result
            };
        },
        exec: async () => result
    });

    const jobModel = {
        create: async (payload: unknown) => {
            calls.push({ method: "create", args: [payload] });
            return job;
        },
        find: (query: unknown) => {
            calls.push({ method: "find", args: [query] });
            return makeFindQuery([job]);
        },
        findById: (id: string) => {
            calls.push({ method: "findById", args: [id] });
            return { exec: async () => job };
        },
        deleteOne: (query: unknown) => {
            calls.push({ method: "deleteOne", args: [query] });
            return { exec: async () => ({ acknowledged: true, deletedCount: 1 }) };
        },
        updateOne: (query: unknown, update: unknown) => {
            calls.push({ method: "updateOne", args: [query, update] });
            return { exec: async () => ({ acknowledged: true, matchedCount: 1, modifiedCount: 1 }) };
        },
        updateMany: (query: unknown, update: unknown) => {
            calls.push({ method: "updateMany", args: [query, update] });
            return { exec: async () => ({ acknowledged: true, matchedCount: 2, modifiedCount: 2 }) };
        },
        findOneAndUpdate: (query: unknown, update: unknown, options: unknown) => {
            calls.push({ method: "findOneAndUpdate", args: [query, update, options] });
            return { exec: async () => job };
        }
    };

    return {
        calls,
        repository: new AIBoxBuildJobRepository(jobModel as any)
    };
}

describe("AIBoxBuildJobRepository", () => {
    it("creates AI box build jobs", async () => {
        const { repository, calls } = makeRepository();
        const payload = { direction: "build lab" };

        await expect(repository.createJob(payload)).resolves.toMatchObject({ _id: "job-1" });

        expect(calls).toEqual([
            { method: "create", args: [payload] }
        ]);
    });

    it("lists recent jobs sorted by update time", async () => {
        const { repository, calls } = makeRepository();

        await expect(repository.listRecentJobs({ requester_user_id: "user-1" }, 25)).resolves.toHaveLength(1);

        expect(calls).toEqual([
            { method: "find", args: [{ requester_user_id: "user-1" }] },
            { method: "sort", args: [{ updated_at: -1 }] },
            { method: "limit", args: [25] }
        ]);
    });

    it("finds and deletes jobs by ID", async () => {
        const { repository, calls } = makeRepository();

        await repository.findById("job-1");
        await repository.deleteById("job-1");

        expect(calls).toEqual([
            { method: "findById", args: ["job-1"] },
            { method: "deleteOne", args: [{ _id: "job-1" }] }
        ]);
    });

    it("updates jobs by ID and updates many by query", async () => {
        const { repository, calls } = makeRepository();
        const update = { updated_at: new Date("2026-05-26T00:00:00.000Z") };

        await repository.updateById("job-1", update);
        await repository.updateMany({ status: "failed" }, update);

        expect(calls).toEqual([
            { method: "updateOne", args: [{ _id: "job-1" }, update] },
            { method: "updateMany", args: [{ status: "failed" }, update] }
        ]);
    });

    it("finds limited jobs and supports atomic findOneAndUpdate", async () => {
        const { repository, calls } = makeRepository();
        const query = { execution_status: { $in: ["provisioning"] } };
        const update = { $set: { execution_status: "failed" } };

        await repository.findLimited(query, 5);
        await repository.findOneAndUpdate(query, update, { new: true });

        expect(calls).toEqual([
            { method: "find", args: [query] },
            { method: "limit", args: [5] },
            { method: "findOneAndUpdate", args: [query, update, { new: true }] }
        ]);
    });
});
