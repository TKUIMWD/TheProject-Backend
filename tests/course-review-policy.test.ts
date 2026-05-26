import { describe, expect, it } from "vitest";
import {
    buildCourseRatingUpdate,
    buildCourseReviewCreateResponse,
    buildCourseReviewMutationResponse,
    canModifyCourseReview,
    isCourseReviewInCourse,
    normalizeCourseReviewIds,
    validateCourseReviewInput
} from "../src/modules/courses/CourseReviewPolicy";

describe("CourseReviewPolicy", () => {
    it("validates course review input through the shared review policy", () => {
        expect(validateCourseReviewInput(5, "  great course  ")).toEqual({
            ok: true,
            rating: 5,
            sanitizedComment: "great course"
        });

        expect(validateCourseReviewInput(0, "")).toEqual({
            ok: false,
            message: "Rating must be an integer between 1 and 5"
        });
    });

    it("normalizes review IDs and checks membership", () => {
        const reviewIds = [
            "review-1",
            { toString: () => "review-2" },
            null,
            ""
        ];

        expect(normalizeCourseReviewIds(reviewIds)).toEqual(["review-1", "review-2"]);
        expect(isCourseReviewInCourse(reviewIds, "review-2")).toBe(true);
        expect(isCourseReviewInCourse(reviewIds, "review-3")).toBe(false);
        expect(normalizeCourseReviewIds(undefined)).toEqual([]);
    });

    it("allows only the review author to modify a review", () => {
        expect(canModifyCourseReview("user-1", "user-1")).toBe(true);
        expect(canModifyCourseReview("user-1", "user-2")).toBe(false);
        expect(canModifyCourseReview(undefined, "user-1")).toBe(false);
    });

    it("builds rating update payloads from review documents", () => {
        expect(buildCourseRatingUpdate([
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

        expect(buildCourseReviewCreateResponse("review-1", ratingUpdate)).toEqual({
            new_rating_score: 4.5,
            review_count: 2,
            review_id: "review-1"
        });

        expect(buildCourseReviewMutationResponse("review-1", ratingUpdate)).toEqual({
            review_id: "review-1",
            new_rating_score: 4.5,
            review_count: 2
        });
    });
});
