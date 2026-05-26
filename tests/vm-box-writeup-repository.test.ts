import { describe, expect, it } from "vitest";
import { BoxWriteupStatus } from "../src/interfaces/BoxWriteup";
import { VMBoxWriteupRepository } from "../src/modules/vm-box/VMBoxWriteupRepository";

function makeRepository() {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const writeup = {
        _id: "writeup-1",
        box_id: "box-1",
        author_user_id: "user-1",
        status: BoxWriteupStatus.pending,
        save: async () => writeup
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
            return { ...writeup, ...(payload as any) };
        },
        find: (query: unknown) => {
            calls.push({ method: "find", args: [query] });
            return makeFindQuery([writeup]);
        },
        findOne: (query: unknown) => {
            calls.push({ method: "findOne", args: [query] });
            return {
                exec: async () => writeup
            };
        },
        findById: (id: string) => {
            calls.push({ method: "findById", args: [id] });
            return {
                exec: async () => ({ ...writeup, _id: id })
            };
        },
        aggregate: (pipeline: unknown[]) => {
            calls.push({ method: "aggregate", args: [pipeline] });
            return {
                exec: async () => [{ _id: "box-1", count: 2 }]
            };
        }
    };

    return {
        calls,
        repository: new VMBoxWriteupRepository(model as any)
    };
}

describe("VMBoxWriteupRepository", () => {
    it("creates writeup documents", () => {
        const { repository, calls } = makeRepository();
        const payload = { box_id: "box-1", title: "Walkthrough" };

        expect(repository.createWriteupDocument(payload)).toMatchObject(payload);

        expect(calls).toEqual([
            { method: "createDocument", args: [payload] }
        ]);
    });

    it("finds active writeups by author and box", async () => {
        const { repository, calls } = makeRepository();

        await repository.findActiveByAuthorAndBox("box-1", "user-1");

        expect(calls).toEqual([
            {
                method: "findOne",
                args: [{
                    box_id: "box-1",
                    author_user_id: "user-1",
                    status: { $in: [BoxWriteupStatus.pending, BoxWriteupStatus.approved] }
                }]
            }
        ]);
    });

    it("lists public approved writeups by box", async () => {
        const { repository, calls } = makeRepository();

        await repository.listPublicApprovedByBox("box-1");

        expect(calls).toEqual([
            {
                method: "find",
                args: [{
                    box_id: "box-1",
                    status: BoxWriteupStatus.approved,
                    is_public: true
                }]
            },
            { method: "sort", args: [{ reviewed_date: -1, submitted_date: -1 }] }
        ]);
    });

    it("lists writeups newest first by filter", async () => {
        const { repository, calls } = makeRepository();
        const filter = { author_user_id: "user-1" };

        await repository.listNewestByFilter(filter);

        expect(calls).toEqual([
            { method: "find", args: [filter] },
            { method: "sort", args: [{ submitted_date: -1 }] }
        ]);
    });

    it("finds writeups by ID", async () => {
        const { repository, calls } = makeRepository();

        await repository.findById("writeup-1");

        expect(calls).toEqual([
            { method: "findById", args: ["writeup-1"] }
        ]);
    });

    it("aggregates public writeup counts", async () => {
        const { repository, calls } = makeRepository();

        await expect(repository.listPublicWriteupCounts(["box-1"])).resolves.toEqual([{ _id: "box-1", count: 2 }]);

        expect(calls).toEqual([
            {
                method: "aggregate",
                args: [[
                    {
                        $match: {
                            box_id: { $in: ["box-1"] },
                            status: BoxWriteupStatus.approved,
                            is_public: true
                        }
                    },
                    { $group: { _id: "$box_id", count: { $sum: 1 } } }
                ]]
            }
        ]);
    });

    it("skips empty public writeup count aggregation", async () => {
        const { repository, calls } = makeRepository();

        await expect(repository.listPublicWriteupCounts([])).resolves.toEqual([]);

        expect(calls).toEqual([]);
    });
});
