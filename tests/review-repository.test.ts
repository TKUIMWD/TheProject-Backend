import { describe, expect, it } from "vitest";
import { ReviewRepository } from "../src/modules/reviews/ReviewRepository";

function makeRepository() {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const review = {
        _id: "review-1",
        reviewer_user_id: "user-1",
        rating_score: 5,
        save: async () => review
    };

    const model = {
        createDocument: (payload: unknown) => {
            calls.push({ method: "createDocument", args: [payload] });
            return { ...review, ...(payload as any) };
        },
        find: (query: unknown) => {
            calls.push({ method: "find", args: [query] });
            return {
                lean: () => {
                    calls.push({ method: "lean", args: [] });
                    return {
                        exec: async () => [review]
                    };
                },
                exec: async () => [review]
            };
        },
        findOne: (query: unknown) => {
            calls.push({ method: "findOne", args: [query] });
            return {
                exec: async () => review
            };
        },
        findById: (id: string) => {
            calls.push({ method: "findById", args: [id] });
            return {
                exec: async () => ({ ...review, _id: id })
            };
        },
        findByIdAndDelete: (id: string) => {
            calls.push({ method: "findByIdAndDelete", args: [id] });
            return {
                exec: async () => ({ ...review, _id: id })
            };
        }
    };

    return {
        calls,
        repository: new ReviewRepository(model as any)
    };
}

describe("ReviewRepository", () => {
    it("creates review documents", () => {
        const { repository, calls } = makeRepository();
        const payload = { reviewer_user_id: "user-1", rating_score: 5 };

        expect(repository.createReviewDocument(payload)).toMatchObject(payload);

        expect(calls).toEqual([
            { method: "createDocument", args: [payload] }
        ]);
    });

    it("finds an existing review inside a target review ID set", async () => {
        const { repository, calls } = makeRepository();

        await repository.findExistingInReviewIds(["review-1"], "user-1");

        expect(calls).toEqual([
            {
                method: "findOne",
                args: [{
                    _id: { $in: ["review-1"] },
                    reviewer_user_id: "user-1"
                }]
            }
        ]);
    });

    it("lists reviews by IDs", async () => {
        const { repository, calls } = makeRepository();

        await repository.listByIds(["review-1"]);

        expect(calls).toEqual([
            { method: "find", args: [{ _id: { $in: ["review-1"] } }] }
        ]);
    });

    it("lists lean reviews by IDs", async () => {
        const { repository, calls } = makeRepository();

        await repository.listByIds(["review-1"], { lean: true });

        expect(calls).toEqual([
            { method: "find", args: [{ _id: { $in: ["review-1"] } }] },
            { method: "lean", args: [] }
        ]);
    });

    it("finds reviews by ID", async () => {
        const { repository, calls } = makeRepository();

        await repository.findById("review-1");

        expect(calls).toEqual([
            { method: "findById", args: ["review-1"] }
        ]);
    });

    it("deletes reviews by ID", async () => {
        const { repository, calls } = makeRepository();

        await repository.deleteById("review-1");

        expect(calls).toEqual([
            { method: "findByIdAndDelete", args: ["review-1"] }
        ]);
    });
});
