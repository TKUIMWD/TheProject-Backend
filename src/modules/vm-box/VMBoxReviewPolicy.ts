import { ReviewPolicy } from "../reviews/ReviewPolicy";

export function normalizeVMBoxReviewIds(reviewIds: unknown): string[] {
    if (!Array.isArray(reviewIds)) {
        return [];
    }

    return reviewIds
        .map((id) => id?.toString?.() ?? "")
        .filter((id) => id !== "");
}

export function isVMBoxReviewInBox(reviewIds: unknown, reviewId: string): boolean {
    return normalizeVMBoxReviewIds(reviewIds).includes(reviewId);
}

export function canModifyVMBoxReview(userId: unknown, reviewerUserId: unknown): boolean {
    return typeof userId === "string" &&
        typeof reviewerUserId === "string" &&
        reviewerUserId === userId;
}

export function buildVMBoxRatingUpdate(reviews: any[]): { rating_score: number; review_count: number } {
    const summary = ReviewPolicy.calculateSummary(reviews);
    return {
        rating_score: summary.averageRating,
        review_count: summary.reviewCount
    };
}

export function buildVMBoxReviewCreateResponse(
    boxId: string,
    reviewId: unknown,
    ratingUpdate: { rating_score: number; review_count: number }
): { box_id: string; new_rating_score: number; review_count: number; review_id: unknown } {
    return {
        box_id: boxId,
        new_rating_score: ratingUpdate.rating_score,
        review_count: ratingUpdate.review_count,
        review_id: reviewId
    };
}

export function buildVMBoxReviewMutationResponse(
    reviewId: string,
    ratingUpdate: { rating_score: number; review_count: number }
): { review_id: string; new_rating_score: number; review_count: number } {
    return {
        review_id: reviewId,
        new_rating_score: ratingUpdate.rating_score,
        review_count: ratingUpdate.review_count
    };
}
