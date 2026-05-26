import { sanitizeString } from "../../utils/sanitize";

type RatingReview = {
    rating_score: number;
};

export type ReviewInputValidation =
    | { ok: true; rating: number; sanitizedComment: string }
    | { ok: false; message: string };

export class ReviewPolicy {
    public static validateInput(rating: unknown, comment: unknown, maxCommentLength = 1000): ReviewInputValidation {
        if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
            return { ok: false, message: "Rating must be an integer between 1 and 5" };
        }

        if (comment !== undefined && typeof comment !== 'string') {
            return { ok: false, message: "comment must be a string" };
        }

        const sanitizedComment = typeof comment === 'string' ? sanitizeString(comment).trim() : "";
        if (sanitizedComment.length > maxCommentLength) {
            return { ok: false, message: `comment exceeds maximum length of ${maxCommentLength} characters` };
        }

        return { ok: true, rating, sanitizedComment };
    }

    public static calculateSummary(reviews: RatingReview[]): { averageRating: number; reviewCount: number } {
        const reviewCount = reviews.length;
        if (reviewCount === 0) {
            return { averageRating: 0, reviewCount: 0 };
        }

        const totalRating = reviews.reduce((sum, review) => sum + review.rating_score, 0);
        return {
            averageRating: Math.round((totalRating / reviewCount) * 100) / 100,
            reviewCount
        };
    }

    public static buildCreatePayload(input: {
        reviewerUserId: string;
        reviewInput: Extract<ReviewInputValidation, { ok: true }>;
        submittedDate?: Date;
    }): {
        reviewer_user_id: string;
        rating_score: number;
        comment?: string;
        submitted_date: Date;
    } {
        return {
            reviewer_user_id: input.reviewerUserId,
            rating_score: input.reviewInput.rating,
            comment: input.reviewInput.sanitizedComment || undefined,
            submitted_date: input.submittedDate || new Date()
        };
    }

    public static buildUpdatePayload(input: {
        reviewInput: Extract<ReviewInputValidation, { ok: true }>;
    }): {
        rating_score: number;
        comment?: string;
    } {
        return {
            rating_score: input.reviewInput.rating,
            comment: input.reviewInput.sanitizedComment || undefined
        };
    }
}
