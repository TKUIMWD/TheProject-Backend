import { describe, expect, it } from "vitest";
import {
    buildVMBoxRatingUpdate,
    buildVMBoxReviewCreateResponse,
    buildVMBoxReviewMutationResponse,
    canModifyVMBoxReview,
    isVMBoxReviewInBox,
    normalizeVMBoxReviewIds
} from "../src/modules/vm-box/VMBoxReviewPolicy";

describe("VMBoxReviewPolicy", () => {
    it("normalizes review IDs and checks membership", () => {
        const reviewIds = [
            "review-1",
            { toString: () => "review-2" },
            null,
            ""
        ];

        expect(normalizeVMBoxReviewIds(reviewIds)).toEqual(["review-1", "review-2"]);
        expect(isVMBoxReviewInBox(reviewIds, "review-2")).toBe(true);
        expect(isVMBoxReviewInBox(reviewIds, "review-3")).toBe(false);
        expect(normalizeVMBoxReviewIds(undefined)).toEqual([]);
    });

    it("allows only the review author to modify a review", () => {
        expect(canModifyVMBoxReview("user-1", "user-1")).toBe(true);
        expect(canModifyVMBoxReview("user-1", "user-2")).toBe(false);
        expect(canModifyVMBoxReview(undefined, "user-1")).toBe(false);
    });

    it("builds rating update payloads from review documents", () => {
        expect(buildVMBoxRatingUpdate([
            { rating_score: 5 },
            { rating_score: 3 }
        ])).toEqual({
            rating_score: 4,
            review_count: 2
        });
    });

    it("builds stable review response payloads", () => {
        const ratingUpdate = {
            rating_score: 4.5,
            review_count: 2
        };

        expect(buildVMBoxReviewCreateResponse("box-1", "review-1", ratingUpdate)).toEqual({
            box_id: "box-1",
            new_rating_score: 4.5,
            review_count: 2,
            review_id: "review-1"
        });

        expect(buildVMBoxReviewMutationResponse("review-1", ratingUpdate)).toEqual({
            review_id: "review-1",
            new_rating_score: 4.5,
            review_count: 2
        });
    });
});
