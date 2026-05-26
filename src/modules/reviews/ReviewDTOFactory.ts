export type ReviewSource = {
    _id?: unknown;
    reviewer_user_id?: unknown;
    rating_score?: number;
    comment?: string;
    submitted_date?: Date;
};

export type ReviewerUserSource = {
    _id?: unknown;
    username?: unknown;
    avatar_path?: unknown;
};

export type ReviewWithUserInfo = {
    _id: string;
    reviewer_user_id: unknown;
    rating_score?: number;
    comment?: string;
    submitted_date?: Date;
    can_modify: boolean;
    reviewer_info: {
        username: string;
        avatar_path: string;
    };
};

export function collectReviewerUserIds(reviews: ReviewSource[]): string[] {
    return Array.from(new Set(
        reviews
            .map((review) => review.reviewer_user_id)
            .filter((id) => id !== undefined && id !== null)
            .map((id) => String(id))
            .filter((id) => id !== "")
    ));
}

export function buildReviewerInfoMap(
    users: ReviewerUserSource[],
    defaultAvatar: string
): Map<string, { username: string; avatar_path: string }> {
    const map = new Map<string, { username: string; avatar_path: string }>();
    users.forEach((user) => {
        if (user._id === undefined || typeof user.username !== "string") {
            return;
        }
        map.set(String(user._id), {
            username: user.username,
            avatar_path: typeof user.avatar_path === "string" && user.avatar_path
                ? user.avatar_path
                : defaultAvatar
        });
    });
    return map;
}

export function buildReviewWithUserInfo(
    review: ReviewSource,
    reviewerInfoById: Map<string, { username: string; avatar_path: string }>,
    currentUserId: string,
    defaultAvatar: string
): ReviewWithUserInfo {
    const reviewerId = review.reviewer_user_id !== undefined && review.reviewer_user_id !== null
        ? String(review.reviewer_user_id)
        : "";
    return {
        _id: String(review._id),
        reviewer_user_id: review.reviewer_user_id,
        rating_score: review.rating_score,
        comment: review.comment,
        submitted_date: review.submitted_date,
        can_modify: reviewerId === currentUserId,
        reviewer_info: reviewerInfoById.get(reviewerId) || {
            username: "Unknown User",
            avatar_path: defaultAvatar
        }
    };
}

export function buildReviewInfoList(
    reviews: ReviewSource[],
    reviewerInfoById: Map<string, { username: string; avatar_path: string }>,
    currentUserId: string,
    defaultAvatar: string
): ReviewWithUserInfo[] {
    return reviews
        .map((review) => buildReviewWithUserInfo(review, reviewerInfoById, currentUserId, defaultAvatar))
        .sort((a, b) => new Date(b.submitted_date || 0).getTime() - new Date(a.submitted_date || 0).getTime());
}
