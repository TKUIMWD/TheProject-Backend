import { describe, expect, it } from "vitest";
import { ReviewPolicy } from "../src/modules/reviews/ReviewPolicy";

describe("ReviewPolicy", () => {
    it("validates integer ratings and normalizes comments", () => {
        const result = ReviewPolicy.validateInput(5, "  great  ");

        expect(result).toEqual({
            ok: true,
            rating: 5,
            sanitizedComment: "great"
        });
    });

    it("rejects invalid ratings and oversized comments", () => {
        expect(ReviewPolicy.validateInput(4.5, "")).toEqual({
            ok: false,
            message: "Rating must be an integer between 1 and 5"
        });
        expect(ReviewPolicy.validateInput(6, "")).toEqual({
            ok: false,
            message: "Rating must be an integer between 1 and 5"
        });
        expect(ReviewPolicy.validateInput(3, "x".repeat(1001))).toEqual({
            ok: false,
            message: "comment exceeds maximum length of 1000 characters"
        });
    });

    it("calculates rounded average ratings", () => {
        expect(ReviewPolicy.calculateSummary([
            { rating_score: 5 },
            { rating_score: 4 },
            { rating_score: 4 }
        ])).toEqual({
            averageRating: 4.33,
            reviewCount: 3
        });
        expect(ReviewPolicy.calculateSummary([])).toEqual({
            averageRating: 0,
            reviewCount: 0
        });
    });

    it("builds review create persistence payloads", () => {
        const submittedDate = new Date("2026-05-26T01:02:03.000Z");

        expect(ReviewPolicy.buildCreatePayload({
            reviewerUserId: "user-1",
            reviewInput: {
                ok: true,
                rating: 5,
                sanitizedComment: "great"
            },
            submittedDate
        })).toEqual({
            reviewer_user_id: "user-1",
            rating_score: 5,
            comment: "great",
            submitted_date: submittedDate
        });

        expect(ReviewPolicy.buildCreatePayload({
            reviewerUserId: "user-1",
            reviewInput: {
                ok: true,
                rating: 4,
                sanitizedComment: ""
            },
            submittedDate
        })).toEqual({
            reviewer_user_id: "user-1",
            rating_score: 4,
            comment: undefined,
            submitted_date: submittedDate
        });
    });

    it("builds review update persistence payloads", () => {
        expect(ReviewPolicy.buildUpdatePayload({
            reviewInput: {
                ok: true,
                rating: 3,
                sanitizedComment: "updated"
            }
        })).toEqual({
            rating_score: 3,
            comment: "updated"
        });

        expect(ReviewPolicy.buildUpdatePayload({
            reviewInput: {
                ok: true,
                rating: 2,
                sanitizedComment: ""
            }
        })).toEqual({
            rating_score: 2,
            comment: undefined
        });
    });
});
