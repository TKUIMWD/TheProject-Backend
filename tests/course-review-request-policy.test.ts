import { describe, expect, it } from "vitest";
import {
    validateCourseReviewCreateRequest,
    validateCourseReviewDeleteRequest,
    validateCourseReviewsQuery,
    validateCourseReviewUpdateRequest
} from "../src/modules/courses/CourseReviewRequestPolicy";

const courseId = "507f1f77bcf86cd799439011";
const reviewId = "507f1f77bcf86cd799439012";

describe("CourseReviewRequestPolicy", () => {
    it("validates course review create requests", () => {
        expect(validateCourseReviewCreateRequest({
            course_id: ` ${courseId} `,
            rating: 5,
            comment: "  great course  "
        })).toEqual({
            valid: true,
            courseId,
            reviewInput: {
                ok: true,
                rating: 5,
                sanitizedComment: "great course"
            }
        });
    });

    it("rejects invalid create requests with existing messages", () => {
        expect(validateCourseReviewCreateRequest({ course_id: courseId })).toEqual({
            valid: false,
            message: "Missing required fields: course_id and rating"
        });

        expect(validateCourseReviewCreateRequest({ course_id: "bad-id", rating: 5 })).toEqual({
            valid: false,
            message: "Invalid course_id format"
        });

        expect(validateCourseReviewCreateRequest({ course_id: courseId, rating: 0 })).toEqual({
            valid: false,
            message: "Rating must be an integer between 1 and 5"
        });
    });

    it("validates course review list queries", () => {
        expect(validateCourseReviewsQuery({ course_id: courseId })).toEqual({
            valid: true,
            courseId
        });
        expect(validateCourseReviewsQuery({})).toEqual({
            valid: false,
            message: "course_id is required"
        });
        expect(validateCourseReviewsQuery({ course_id: "bad-id" })).toEqual({
            valid: false,
            message: "Invalid course_id format"
        });
    });

    it("validates course review update requests", () => {
        expect(validateCourseReviewUpdateRequest({
            review_id: reviewId,
            course_id: courseId,
            rating: 4,
            comment: "updated"
        })).toEqual({
            valid: true,
            reviewId,
            courseId,
            reviewInput: {
                ok: true,
                rating: 4,
                sanitizedComment: "updated"
            }
        });

        expect(validateCourseReviewUpdateRequest({
            review_id: "bad-id",
            course_id: courseId,
            rating: 4
        })).toEqual({
            valid: false,
            message: "Invalid review_id format"
        });
    });

    it("validates course review delete requests", () => {
        expect(validateCourseReviewDeleteRequest({ review_id: reviewId, course_id: courseId })).toEqual({
            valid: true,
            reviewId,
            courseId
        });

        expect(validateCourseReviewDeleteRequest({ review_id: reviewId })).toEqual({
            valid: false,
            message: "Invalid course_id format"
        });
    });
});
