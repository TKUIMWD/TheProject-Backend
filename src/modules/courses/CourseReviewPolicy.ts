import { ReviewPolicy } from "../reviews/ReviewPolicy";

export function validateCourseReviewInput(rating: unknown, comment: unknown) {
    return ReviewPolicy.validateInput(rating, comment);
}

export function normalizeCourseReviewIds(reviewIds: unknown): string[] {
    if (!Array.isArray(reviewIds)) {
        return [];
    }

    return reviewIds
        .map((id) => id?.toString?.() ?? "")
        .filter((id) => id !== "");
}

export function isCourseReviewInCourse(reviewIds: unknown, reviewId: string): boolean {
    return normalizeCourseReviewIds(reviewIds).includes(reviewId);
}

export function canModifyCourseReview(userId: unknown, reviewerUserId: unknown): boolean {
    return typeof userId === "string" &&
        typeof reviewerUserId === "string" &&
        reviewerUserId === userId;
}

export function buildCourseRatingUpdate(reviews: any[]): { rating_score: number; review_count: number } {
    const summary = ReviewPolicy.calculateSummary(reviews);
    return {
        rating_score: summary.averageRating,
        review_count: summary.reviewCount
    };
}

export function buildCourseReviewCreateResponse(
    reviewId: unknown,
    ratingUpdate: { rating_score: number; review_count: number }
): { new_rating_score: number; review_count: number; review_id: unknown } {
    return {
        new_rating_score: ratingUpdate.rating_score,
        review_count: ratingUpdate.review_count,
        review_id: reviewId
    };
}

export function buildCourseReviewMutationResponse(
    reviewId: string,
    ratingUpdate: { rating_score: number; review_count: number }
): { review_id: string; new_rating_score: number; review_count: number } {
    return {
        review_id: reviewId,
        new_rating_score: ratingUpdate.rating_score,
        review_count: ratingUpdate.review_count
    };
}
