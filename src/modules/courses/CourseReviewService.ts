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
    canReviewCourse,
    canViewCourseReviews
} from "./CourseAccessPolicy";
import { courseRepository } from "./CourseRepository";
import {
    buildCourseRatingUpdate,
    buildCourseReviewCreateResponse,
    buildCourseReviewMutationResponse,
    canModifyCourseReview,
    isCourseReviewInCourse,
    normalizeCourseReviewIds
} from "./CourseReviewPolicy";
import {
    validateCourseReviewCreateRequest,
    validateCourseReviewDeleteRequest,
    validateCourseReviewsQuery,
    validateCourseReviewUpdateRequest
} from "./CourseReviewRequestPolicy";

type CourseRepositoryPort = {
    findById(courseId: string): Promise<any | null>;
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

export type CourseReviewServiceDeps = {
    courseRepository?: CourseRepositoryPort;
    reviews?: ReviewRepositoryPort;
    users?: UserRepositoryPort;
    defaultAvatar?: string;
};

export class CourseReviewService {
    private readonly courseRepository: CourseRepositoryPort;
    private readonly reviews: ReviewRepositoryPort;
    private readonly users: UserRepositoryPort;
    private readonly defaultAvatar: string;

    constructor(deps: CourseReviewServiceDeps = {}) {
        this.courseRepository = deps.courseRepository ?? courseRepository;
        this.reviews = deps.reviews ?? reviewRepository;
        this.users = deps.users ?? userRepository;
        this.defaultAvatar = deps.defaultAvatar ?? DEFAULT_AVATAR;
    }

    public async createReview(input: {
        user: any;
        request: { course_id?: unknown; rating?: unknown; comment?: unknown };
    }): Promise<resp<any>> {
        const reviewRequest = validateCourseReviewCreateRequest(input.request);
        if (!reviewRequest.valid) {
            return createResponse(400, reviewRequest.message);
        }
        const courseId = reviewRequest.courseId;

        const course = await this.courseRepository.findById(courseId);
        if (!course) {
            return createResponse(404, "Course not found");
        }

        const userId = input.user._id.toString();
        if (!canReviewCourse({
            courseId,
            courseStatus: course.status,
            submitterUserId: course.submitter_user_id,
            userId,
            userRole: input.user.role,
            joinedCourseIds: input.user.course_ids
        })) {
            return createResponse(403, "You must join this public course before reviewing it");
        }

        const existingReview = await this.reviews.findExistingInReviewIds(course.reviews, userId);
        if (existingReview) {
            return createResponse(400, "You have already reviewed this course");
        }

        const newReview = this.reviews.createReviewDocument(ReviewPolicy.buildCreatePayload({
            reviewerUserId: userId,
            reviewInput: reviewRequest.reviewInput
        }));
        await newReview.save();

        course.reviews.push(newReview._id.toString());
        const reviews = await this.reviews.listByIds(course.reviews, { lean: true });
        const ratingUpdate = {
            ...buildCourseRatingUpdate(reviews),
            review_count: course.reviews.length
        };
        course.rating = ratingUpdate.rating_score;
        await course.save();

        return createResponse(200, "Course rated successfully", buildCourseReviewCreateResponse(newReview._id, ratingUpdate));
    }

    public async listReviews(input: {
        user: any;
        request: { course_id?: unknown };
    }): Promise<resp<any>> {
        const queryPolicy = validateCourseReviewsQuery(input.request);
        if (!queryPolicy.valid) {
            return createResponse(400, queryPolicy.message);
        }
        const courseId = queryPolicy.courseId;

        const course = await this.courseRepository.findById(courseId);
        if (!course) {
            return createResponse(404, "Course not found");
        }

        const userId = input.user._id.toString();
        if (!canViewCourseReviews({
            courseId,
            courseStatus: course.status,
            submitterUserId: course.submitter_user_id,
            userId,
            userRole: input.user.role,
            joinedCourseIds: input.user.course_ids
        })) {
            return createResponse(403, "Cannot view reviews for this course");
        }

        const reviews = await this.reviews.listByIds(course.reviews, { lean: true });
        const reviewerInfoById = buildReviewerInfoMap(
            await this.users.listByIds(collectReviewerUserIds(reviews), { lean: true }),
            this.defaultAvatar
        );
        const reviewsWithUserInfo = buildReviewInfoList(reviews, reviewerInfoById, userId, this.defaultAvatar);

        return createResponse(200, "Course reviews fetched successfully", {
            course_id: courseId,
            reviews: reviewsWithUserInfo,
            total_reviews: reviewsWithUserInfo.length,
            average_rating: course.rating
        });
    }

    public async updateReview(input: {
        user: any;
        request: { review_id?: unknown; course_id?: unknown; rating?: unknown; comment?: unknown };
    }): Promise<resp<any>> {
        const reviewRequest = validateCourseReviewUpdateRequest(input.request);
        if (!reviewRequest.valid) {
            return createResponse(400, reviewRequest.message);
        }
        const { reviewId, courseId } = reviewRequest;

        const course = await this.courseRepository.findById(courseId);
        if (!course) {
            return createResponse(404, "Course not found");
        }
        if (!isCourseReviewInCourse(course.reviews, reviewId)) {
            return createResponse(404, "Review not found for this course");
        }

        const review = await this.reviews.findById(reviewId);
        if (!review) {
            return createResponse(404, "Review not found");
        }
        if (!canModifyCourseReview(input.user._id?.toString(), review.reviewer_user_id?.toString())) {
            return createResponse(403, "You can only edit your own review");
        }

        const reviewPatch = ReviewPolicy.buildUpdatePayload({ reviewInput: reviewRequest.reviewInput });
        review.rating_score = reviewPatch.rating_score;
        review.comment = reviewPatch.comment;
        await review.save();

        const reviews = await this.reviews.listByIds(course.reviews, { lean: true });
        const ratingUpdate = buildCourseRatingUpdate(reviews);
        course.rating = ratingUpdate.rating_score;
        await course.save();

        return createResponse(200, "Course review updated successfully", buildCourseReviewMutationResponse(reviewId, ratingUpdate));
    }

    public async deleteReview(input: {
        user: any;
        request: { review_id?: unknown; course_id?: unknown };
    }): Promise<resp<any>> {
        const reviewRequest = validateCourseReviewDeleteRequest(input.request);
        if (!reviewRequest.valid) {
            return createResponse(400, reviewRequest.message);
        }
        const { reviewId, courseId } = reviewRequest;

        const course = await this.courseRepository.findById(courseId);
        if (!course) {
            return createResponse(404, "Course not found");
        }
        const reviewIds = normalizeCourseReviewIds(course.reviews);
        if (!reviewIds.includes(reviewId)) {
            return createResponse(404, "Review not found for this course");
        }

        const review = await this.reviews.findById(reviewId);
        if (!review) {
            return createResponse(404, "Review not found");
        }
        if (!canModifyCourseReview(input.user._id?.toString(), review.reviewer_user_id?.toString())) {
            return createResponse(403, "You can only delete your own review");
        }

        course.reviews = reviewIds.filter((id: string) => id !== reviewId);
        await this.reviews.deleteById(reviewId);
        const reviews = await this.reviews.listByIds(course.reviews, { lean: true });
        const ratingUpdate = buildCourseRatingUpdate(reviews);
        course.rating = ratingUpdate.rating_score;
        await course.save();

        return createResponse(200, "Course review deleted successfully", buildCourseReviewMutationResponse(reviewId, ratingUpdate));
    }
}

export const courseReviewService = new CourseReviewService();
