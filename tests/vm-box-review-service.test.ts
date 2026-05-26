import { describe, expect, it } from "vitest";
import { VMBoxReviewService } from "../src/modules/vm-box/VMBoxReviewService";

const boxId = "507f1f77bcf86cd799439011";
const reviewId = "507f1f77bcf86cd799439012";
const userId = "507f1f77bcf86cd799439013";

function makeUser(overrides: Record<string, unknown> = {}) {
    return {
        _id: { toString: () => userId },
        email: "student@example.test",
        ...overrides
    };
}

function makeBox(overrides: Record<string, unknown> = {}) {
    return {
        _id: { toString: () => boxId },
        is_public: true,
        reviews: [],
        rating_score: 0,
        review_count: 0,
        save: async () => undefined,
        ...overrides
    };
}

function makeReview(overrides: Record<string, unknown> = {}) {
    return {
        _id: reviewId,
        reviewer_user_id: userId,
        rating_score: 5,
        comment: "great",
        submitted_date: new Date("2026-05-26T00:00:00.000Z"),
        save: async () => undefined,
        ...overrides
    };
}

function makeService(options: {
    box?: any;
    existingReview?: any;
    review?: any;
    listedReviews?: any[];
    users?: any[];
} = {}) {
    const calls: Array<{ target: string; method: string; args: unknown[] }> = [];
    const box = Object.prototype.hasOwnProperty.call(options, "box") ? options.box : makeBox();
    const createdReview = makeReview();

    const boxRepository = {
        findById: async (id: string) => {
            calls.push({ target: "box", method: "findById", args: [id] });
            return box;
        }
    };

    const reviews = {
        findExistingInReviewIds: async (reviewIds: unknown[], reviewerUserId: string) => {
            calls.push({ target: "reviews", method: "findExistingInReviewIds", args: [reviewIds, reviewerUserId] });
            return options.existingReview ?? null;
        },
        createReviewDocument: (payload: unknown) => {
            calls.push({ target: "reviews", method: "createReviewDocument", args: [payload] });
            return createdReview;
        },
        listByIds: async (reviewIds: unknown[], queryOptions?: unknown) => {
            calls.push({ target: "reviews", method: "listByIds", args: queryOptions === undefined ? [reviewIds] : [reviewIds, queryOptions] });
            return options.listedReviews ?? [createdReview];
        },
        findById: async (id: string) => {
            calls.push({ target: "reviews", method: "findById", args: [id] });
            return Object.prototype.hasOwnProperty.call(options, "review") ? options.review : makeReview();
        },
        deleteById: async (id: string) => {
            calls.push({ target: "reviews", method: "deleteById", args: [id] });
        }
    };

    const users = {
        listByIds: async (userIds: string[], queryOptions?: unknown) => {
            calls.push({ target: "users", method: "listByIds", args: [userIds, queryOptions] });
            return options.users ?? [
                { _id: userId, username: "student", avatar_path: "/student.png" }
            ];
        }
    };

    return {
        box,
        calls,
        createdReview,
        service: new VMBoxReviewService({
            boxRepository,
            reviews,
            users,
            defaultAvatar: "/default.png"
        })
    };
}

describe("VMBoxReviewService", () => {
    it("creates a review, attaches it to the box, and recalculates rating", async () => {
        const { service, box, calls } = makeService();

        await expect(service.createReview({
            user: makeUser(),
            request: {
                box_id: boxId,
                rating: 5,
                comment: "great"
            }
        })).resolves.toMatchObject({
            code: 200,
            body: {
                box_id: boxId,
                review_id: reviewId,
                new_rating_score: 5,
                review_count: 1
            }
        });

        expect(box.reviews).toEqual([reviewId]);
        expect(box.rating_score).toBe(5);
        expect(box.review_count).toBe(1);
        expect(calls.map(call => `${call.target}.${call.method}`)).toEqual([
            "box.findById",
            "reviews.findExistingInReviewIds",
            "reviews.createReviewDocument",
            "reviews.listByIds"
        ]);
    });

    it("lists public box reviews with reviewer info", async () => {
        const { service } = makeService({
            box: makeBox({
                reviews: [reviewId],
                rating_score: 4.5
            }),
            listedReviews: [makeReview({ comment: "solid" })]
        });

        await expect(service.listReviews({
            user: makeUser(),
            request: { box_id: boxId }
        })).resolves.toMatchObject({
            code: 200,
            body: {
                box_id: boxId,
                total_reviews: 1,
                average_rating: 4.5,
                reviews: [
                    {
                        _id: reviewId,
                        can_modify: true,
                        reviewer_info: {
                            username: "student",
                            avatar_path: "/student.png"
                        }
                    }
                ]
            }
        });
    });

    it("rejects updates from non-authors", async () => {
        const { service } = makeService({
            box: makeBox({ reviews: [reviewId] }),
            review: makeReview({ reviewer_user_id: "someone-else" })
        });

        await expect(service.updateReview({
            user: makeUser(),
            request: {
                review_id: reviewId,
                box_id: boxId,
                rating: 4,
                comment: "updated"
            }
        })).resolves.toMatchObject({
            code: 403,
            message: "You can only edit your own review"
        });
    });

    it("deletes a review and recalculates rating", async () => {
        const remainingReviewId = "507f1f77bcf86cd799439014";
        const { service, box, calls } = makeService({
            box: makeBox({ reviews: [reviewId, remainingReviewId] }),
            listedReviews: [makeReview({ _id: remainingReviewId, rating_score: 3 })]
        });

        await expect(service.deleteReview({
            user: makeUser(),
            request: {
                review_id: reviewId,
                box_id: boxId
            }
        })).resolves.toMatchObject({
            code: 200,
            body: {
                review_id: reviewId,
                new_rating_score: 3,
                review_count: 1
            }
        });

        expect(box.reviews).toEqual([remainingReviewId]);
        expect(calls).toContainEqual({ target: "reviews", method: "deleteById", args: [reviewId] });
    });
});
