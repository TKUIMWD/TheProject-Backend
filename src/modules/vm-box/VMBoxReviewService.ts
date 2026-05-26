import { DEFAULT_AVATAR } from "../../utils/avatarUpload";
import { resp, createResponse } from "../../utils/resp";
import {
    buildReviewInfoList,
    buildReviewerInfoMap,
    collectReviewerUserIds
} from "../reviews/ReviewDTOFactory";
import { ReviewPolicy } from "../reviews/ReviewPolicy";
import { reviewRepository } from "../reviews/ReviewRepository";
import { userRepository } from "../users/UserRepository";
import {
    buildVMBoxRatingUpdate,
    buildVMBoxReviewCreateResponse,
    buildVMBoxReviewMutationResponse,
    canModifyVMBoxReview,
    isVMBoxReviewInBox,
    normalizeVMBoxReviewIds
} from "./VMBoxReviewPolicy";
import {
    validateBoxReviewCreateRequest,
    validateBoxReviewDeleteRequest,
    validateBoxReviewsQuery,
    validateBoxReviewUpdateRequest
} from "./VMBoxReviewRequestPolicy";
import { vmBoxRepository } from "./VMBoxRepository";

type VMBoxRepositoryPort = {
    findById(boxId: string): Promise<any | null>;
};

type ReviewRepositoryPort = {
    findExistingInReviewIds(reviewIds: unknown[], reviewerUserId: string): Promise<any | null>;
    createReviewDocument(payload: unknown): any;
    listByIds(reviewIds: unknown[], options?: unknown): Promise<any[]>;
    findById(reviewId: string): Promise<any | null>;
    deleteById(reviewId: string): Promise<unknown>;
};

type UserRepositoryPort = {
    listByIds(userIds: string[], options?: unknown): Promise<any[]>;
};

export type VMBoxReviewServiceDeps = {
    boxRepository?: VMBoxRepositoryPort;
    reviews?: ReviewRepositoryPort;
    users?: UserRepositoryPort;
    defaultAvatar?: string;
};

export class VMBoxReviewService {
    private readonly boxRepository: VMBoxRepositoryPort;
    private readonly reviews: ReviewRepositoryPort;
    private readonly users: UserRepositoryPort;
    private readonly defaultAvatar: string;

    constructor(deps: VMBoxReviewServiceDeps = {}) {
        this.boxRepository = deps.boxRepository ?? vmBoxRepository;
        this.reviews = deps.reviews ?? reviewRepository;
        this.users = deps.users ?? userRepository;
        this.defaultAvatar = deps.defaultAvatar ?? DEFAULT_AVATAR;
    }

    public async createReview(input: {
        user: any;
        request: { box_id?: unknown; rating?: unknown; comment?: unknown };
    }): Promise<resp<any>> {
        const reviewRequest = validateBoxReviewCreateRequest(input.request);
        if (!reviewRequest.valid) {
            return createResponse(400, reviewRequest.message);
        }

        const box = await this.boxRepository.findById(reviewRequest.boxId);
        if (!box) {
            return createResponse(404, "Box not found");
        }

        if (!box.is_public) {
            return createResponse(403, "Cannot rate unapproved box");
        }

        const reviewerUserId = input.user._id?.toString() || "";
        const existingReview = await this.reviews.findExistingInReviewIds(box.reviews, reviewerUserId);
        if (existingReview) {
            return createResponse(400, "You have already rated this box");
        }

        const newReview = this.reviews.createReviewDocument(ReviewPolicy.buildCreatePayload({
            reviewerUserId,
            reviewInput: reviewRequest.reviewInput
        }));

        await newReview.save();

        box.reviews.push(newReview._id.toString());
        const reviews = await this.reviews.listByIds(box.reviews, { lean: true });
        const ratingUpdate = buildVMBoxRatingUpdate(reviews);
        box.rating_score = ratingUpdate.rating_score;
        box.review_count = ratingUpdate.review_count;

        await box.save();

        return createResponse(200, "Rating submitted successfully", buildVMBoxReviewCreateResponse(
            reviewRequest.boxId,
            newReview._id,
            ratingUpdate
        ));
    }

    public async listReviews(input: {
        user: any;
        request: { box_id?: unknown };
    }): Promise<resp<any>> {
        const queryPolicy = validateBoxReviewsQuery(input.request);
        if (!queryPolicy.valid) {
            return createResponse(400, queryPolicy.message);
        }

        const box = await this.boxRepository.findById(queryPolicy.boxId);
        if (!box) {
            return createResponse(404, "Box not found");
        }

        if (!box.is_public) {
            return createResponse(403, "Cannot view reviews for unapproved box");
        }

        const reviews = await this.reviews.listByIds(box.reviews);
        const reviewerInfoById = buildReviewerInfoMap(
            await this.users.listByIds(collectReviewerUserIds(reviews), { lean: true }),
            this.defaultAvatar
        );
        const reviewsWithUserInfo = buildReviewInfoList(reviews, reviewerInfoById, input.user._id.toString(), this.defaultAvatar);

        return createResponse(200, "Box reviews fetched successfully", {
            box_id: queryPolicy.boxId,
            reviews: reviewsWithUserInfo,
            total_reviews: reviewsWithUserInfo.length,
            average_rating: box.rating_score
        });
    }

    public async updateReview(input: {
        user: any;
        request: { review_id?: unknown; box_id?: unknown; rating?: unknown; comment?: unknown };
    }): Promise<resp<any>> {
        const reviewRequest = validateBoxReviewUpdateRequest(input.request);
        if (!reviewRequest.valid) {
            return createResponse(400, reviewRequest.message);
        }

        const box = await this.boxRepository.findById(reviewRequest.boxId);
        if (!box) {
            return createResponse(404, "Box not found");
        }
        if (!isVMBoxReviewInBox(box.reviews, reviewRequest.reviewId)) {
            return createResponse(404, "Review not found for this box");
        }

        const review = await this.reviews.findById(reviewRequest.reviewId);
        if (!review) {
            return createResponse(404, "Review not found");
        }
        if (!canModifyVMBoxReview(input.user._id?.toString(), review.reviewer_user_id?.toString())) {
            return createResponse(403, "You can only edit your own review");
        }

        const reviewPatch = ReviewPolicy.buildUpdatePayload({ reviewInput: reviewRequest.reviewInput });
        review.rating_score = reviewPatch.rating_score;
        review.comment = reviewPatch.comment;
        await review.save();

        const reviews = await this.reviews.listByIds(box.reviews, { lean: true });
        const ratingUpdate = buildVMBoxRatingUpdate(reviews);
        box.rating_score = ratingUpdate.rating_score;
        box.review_count = ratingUpdate.review_count;
        await box.save();

        return createResponse(200, "Box review updated successfully", buildVMBoxReviewMutationResponse(
            reviewRequest.reviewId,
            ratingUpdate
        ));
    }

    public async deleteReview(input: {
        user: any;
        request: { review_id?: unknown; box_id?: unknown };
    }): Promise<resp<any>> {
        const reviewRequest = validateBoxReviewDeleteRequest(input.request);
        if (!reviewRequest.valid) {
            return createResponse(400, reviewRequest.message);
        }

        const box = await this.boxRepository.findById(reviewRequest.boxId);
        if (!box) {
            return createResponse(404, "Box not found");
        }
        const reviewIds = normalizeVMBoxReviewIds(box.reviews);
        if (!reviewIds.includes(reviewRequest.reviewId)) {
            return createResponse(404, "Review not found for this box");
        }

        const review = await this.reviews.findById(reviewRequest.reviewId);
        if (!review) {
            return createResponse(404, "Review not found");
        }
        if (!canModifyVMBoxReview(input.user._id?.toString(), review.reviewer_user_id?.toString())) {
            return createResponse(403, "You can only delete your own review");
        }

        box.reviews = reviewIds.filter((id: string) => id !== reviewRequest.reviewId) as any;
        await this.reviews.deleteById(reviewRequest.reviewId);
        const reviews = await this.reviews.listByIds(box.reviews, { lean: true });
        const ratingUpdate = buildVMBoxRatingUpdate(reviews);
        box.rating_score = ratingUpdate.rating_score;
        box.review_count = ratingUpdate.review_count;
        await box.save();

        return createResponse(200, "Box review deleted successfully", buildVMBoxReviewMutationResponse(
            reviewRequest.reviewId,
            ratingUpdate
        ));
    }
}

export const vmBoxReviewService = new VMBoxReviewService();
