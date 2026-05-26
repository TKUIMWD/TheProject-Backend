import { describe, expect, it } from "vitest";
import { CourseReviewService } from "../src/modules/courses/CourseReviewService";

const courseId = "507f1f77bcf86cd799439021";
const reviewId = "507f1f77bcf86cd799439022";
const userId = "507f1f77bcf86cd799439023";

function makeUser(overrides: Record<string, unknown> = {}) {
    return {
        _id: { toString: () => userId },
        email: "student@example.test",
        role: "user",
        course_ids: [courseId],
        ...overrides
    };
}

function makeCourse(overrides: Record<string, unknown> = {}) {
    return {
        _id: { toString: () => courseId },
        status: "公開",
        submitter_user_id: "owner-1",
        reviews: [],
        rating: 0,
        save: async () => undefined,
        ...overrides
    };
}

function makeReview(overrides: Record<string, unknown> = {}) {
    return {
        _id: reviewId,
        reviewer_user_id: userId,
        rating_score: 5,
        comment: "great",
        submitted_date: new Date("2026-05-26T00:00:00.000Z"),
        save: async () => undefined,
        ...overrides
    };
}

function makeService(options: {
    course?: any;
    existingReview?: any;
    review?: any;
    listedReviews?: any[];
    users?: any[];
} = {}) {
    const calls: Array<{ target: string; method: string; args: unknown[] }> = [];
    const course = Object.prototype.hasOwnProperty.call(options, "course") ? options.course : makeCourse();
    const createdReview = makeReview();

    const courseRepository = {
        findById: async (id: string) => {
            calls.push({ target: "course", method: "findById", args: [id] });
            return course;
        }
    };
    const reviews = {
        findExistingInReviewIds: async (reviewIds: unknown[], reviewerUserId: string) => {
            calls.push({ target: "reviews", method: "findExistingInReviewIds", args: [reviewIds, reviewerUserId] });
            return options.existingReview ?? null;
        },
        createReviewDocument: (payload: unknown) => {
            calls.push({ target: "reviews", method: "createReviewDocument", args: [payload] });
            return createdReview;
        },
        listByIds: async (reviewIds: unknown[], queryOptions?: unknown) => {
            calls.push({ target: "reviews", method: "listByIds", args: queryOptions === undefined ? [reviewIds] : [reviewIds, queryOptions] });
            return options.listedReviews ?? [createdReview];
        },
        findById: async (id: string) => {
            calls.push({ target: "reviews", method: "findById", args: [id] });
            return Object.prototype.hasOwnProperty.call(options, "review") ? options.review : makeReview();
        },
        deleteById: async (id: string) => {
            calls.push({ target: "reviews", method: "deleteById", args: [id] });
        }
    };
    const users = {
        listByIds: async (userIds: string[], queryOptions?: unknown) => {
            calls.push({ target: "users", method: "listByIds", args: [userIds, queryOptions] });
            return options.users ?? [
                { _id: userId, username: "student", avatar_path: "/student.png" }
            ];
        }
    };

    return {
        calls,
        course,
        createdReview,
        service: new CourseReviewService({
            courseRepository,
            reviews,
            users,
            defaultAvatar: "/default.png"
        })
    };
}

describe("CourseReviewService", () => {
    it("creates a review, attaches it to the course, and recalculates rating", async () => {
        const { service, course, calls } = makeService();

        await expect(service.createReview({
            user: makeUser(),
            request: {
                course_id: courseId,
                rating: 5,
                comment: "great"
            }
        })).resolves.toMatchObject({
            code: 200,
            body: {
                review_id: reviewId,
                new_rating_score: 5,
                review_count: 1
            }
        });

        expect(course.reviews).toEqual([reviewId]);
        expect(course.rating).toBe(5);
        expect(calls.map(call => `${call.target}.${call.method}`)).toEqual([
            "course.findById",
            "reviews.findExistingInReviewIds",
            "reviews.createReviewDocument",
            "reviews.listByIds"
        ]);
    });

    it("lists course reviews with reviewer info for joined users", async () => {
        const { service } = makeService({
            course: makeCourse({
                reviews: [reviewId],
                rating: 4.5
            }),
            listedReviews: [makeReview({ comment: "solid" })]
        });

        await expect(service.listReviews({
            user: makeUser(),
            request: { course_id: courseId }
        })).resolves.toMatchObject({
            code: 200,
            body: {
                course_id: courseId,
                total_reviews: 1,
                average_rating: 4.5,
                reviews: [
                    {
                        _id: reviewId,
                        can_modify: true,
                        reviewer_info: {
                            username: "student",
                            avatar_path: "/student.png"
                        }
                    }
                ]
            }
        });
    });

    it("rejects updates from non-authors", async () => {
        const { service } = makeService({
            course: makeCourse({ reviews: [reviewId] }),
            review: makeReview({ reviewer_user_id: "someone-else" })
        });

        await expect(service.updateReview({
            user: makeUser(),
            request: {
                review_id: reviewId,
                course_id: courseId,
                rating: 4,
                comment: "updated"
            }
        })).resolves.toMatchObject({
            code: 403,
            message: "You can only edit your own review"
        });
    });

    it("deletes a review and recalculates rating", async () => {
        const remainingReviewId = "507f1f77bcf86cd799439024";
        const { service, course, calls } = makeService({
            course: makeCourse({ reviews: [reviewId, remainingReviewId] }),
            listedReviews: [makeReview({ _id: remainingReviewId, rating_score: 3 })]
        });

        await expect(service.deleteReview({
            user: makeUser(),
            request: {
                review_id: reviewId,
                course_id: courseId
            }
        })).resolves.toMatchObject({
            code: 200,
            body: {
                review_id: reviewId,
                new_rating_score: 3,
                review_count: 1
            }
        });

        expect(course.reviews).toEqual([remainingReviewId]);
        expect(course.rating).toBe(3);
        expect(calls).toContainEqual({ target: "reviews", method: "deleteById", args: [reviewId] });
    });
});
