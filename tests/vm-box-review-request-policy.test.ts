import { describe, expect, it } from "vitest";
import {
    validateBoxReviewCreateRequest,
    validateBoxReviewDeleteRequest,
    validateBoxReviewsQuery,
    validateBoxReviewUpdateRequest
} from "../src/modules/vm-box/VMBoxReviewRequestPolicy";

const boxId = "507f1f77bcf86cd799439011";
const reviewId = "507f1f77bcf86cd799439012";

describe("VMBoxReviewRequestPolicy", () => {
    it("validates rating create requests", () => {
        expect(validateBoxReviewCreateRequest({
            box_id: ` ${boxId} `,
            rating: 5,
            comment: "  <b>great</b>  "
        })).toEqual({
            valid: true,
            boxId,
            reviewInput: {
                ok: true,
                rating: 5,
                sanitizedComment: "<b>great</b>"
            }
        });
    });

    it("rejects invalid create requests with existing messages", () => {
        expect(validateBoxReviewCreateRequest({ box_id: boxId })).toEqual({
            valid: false,
            message: "Missing required fields: box_id and rating"
        });

        expect(validateBoxReviewCreateRequest({ box_id: "bad-id", rating: 5 })).toEqual({
            valid: false,
            message: "Invalid box_id format"
        });

        expect(validateBoxReviewCreateRequest({ box_id: boxId, rating: 6 })).toEqual({
            valid: false,
            message: "Rating must be an integer between 1 and 5"
        });
    });

    it("validates review listing query", () => {
        expect(validateBoxReviewsQuery({ box_id: boxId })).toEqual({ valid: true, boxId });
        expect(validateBoxReviewsQuery({})).toEqual({
            valid: false,
            message: "Missing required parameter: box_id"
        });
        expect(validateBoxReviewsQuery({ box_id: "bad-id" })).toEqual({
            valid: false,
            message: "Invalid box_id format"
        });
    });

    it("validates update requests", () => {
        expect(validateBoxReviewUpdateRequest({
            review_id: reviewId,
            box_id: boxId,
            rating: 4,
            comment: "updated"
        })).toEqual({
            valid: true,
            reviewId,
            boxId,
            reviewInput: {
                ok: true,
                rating: 4,
                sanitizedComment: "updated"
            }
        });

        expect(validateBoxReviewUpdateRequest({
            review_id: "bad-id",
            box_id: boxId,
            rating: 4
        })).toEqual({
            valid: false,
            message: "Invalid review_id format"
        });
    });

    it("validates delete requests", () => {
        expect(validateBoxReviewDeleteRequest({ review_id: reviewId, box_id: boxId })).toEqual({
            valid: true,
            reviewId,
            boxId
        });

        expect(validateBoxReviewDeleteRequest({ review_id: reviewId })).toEqual({
            valid: false,
            message: "Invalid box_id format"
        });
    });
});
