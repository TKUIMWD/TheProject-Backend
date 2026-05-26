import { describe, expect, it } from "vitest";
import { CourseRequestAdapterService } from "../src/modules/courses/CourseRequestAdapterService";

const courseId = "507f1f77bcf86cd799439012";
const user = { _id: "507f1f77bcf86cd799439011" };

function makeService() {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const response = (method: string) => ({ code: 200, message: method, body: undefined });
    const service = new CourseRequestAdapterService({
        read: {
            getCoursePage: async (...args) => {
                calls.push({ method: "getCoursePage", args });
                return response("getCoursePage");
            },
            getCourseMenu: async (...args) => {
                calls.push({ method: "getCourseMenu", args });
                return response("getCourseMenu");
            },
            getFirstTemplate: async (...args) => {
                calls.push({ method: "getFirstTemplate", args });
                return response("getFirstTemplate");
            }
        } as any,
        mutation: {
            createCourse: async (...args) => {
                calls.push({ method: "createCourse", args });
                return response("createCourse");
            },
            updateCourse: async (...args) => {
                calls.push({ method: "updateCourse", args });
                return response("updateCourse");
            },
            deleteCourse: async (...args) => {
                calls.push({ method: "deleteCourse", args });
                return response("deleteCourse");
            }
        } as any,
        list: {
            listPublicCourses: async () => {
                calls.push({ method: "listPublicCourses", args: [] });
                return response("listPublicCourses");
            },
            listAllCourses: async () => {
                calls.push({ method: "listAllCourses", args: [] });
                return response("listAllCourses");
            },
            listSubmittedCourses: async () => {
                calls.push({ method: "listSubmittedCourses", args: [] });
                return response("listSubmittedCourses");
            }
        } as any,
        membership: {
            joinCourse: async (...args) => {
                calls.push({ method: "joinCourse", args });
                return response("joinCourse");
            },
            inviteUsers: async (...args) => {
                calls.push({ method: "inviteUsers", args });
                return response("inviteUsers");
            }
        } as any,
        review: {
            createReview: async (...args) => {
                calls.push({ method: "createReview", args });
                return response("createReview");
            },
            listReviews: async (...args) => {
                calls.push({ method: "listReviews", args });
                return response("listReviews");
            },
            updateReview: async (...args) => {
                calls.push({ method: "updateReview", args });
                return response("updateReview");
            },
            deleteReview: async (...args) => {
                calls.push({ method: "deleteReview", args });
                return response("deleteReview");
            }
        } as any,
        lifecycle: {
            approveCourse: async (...args) => {
                calls.push({ method: "approveCourse", args });
                return response("approveCourse");
            },
            unapproveCourse: async (...args) => {
                calls.push({ method: "unapproveCourse", args });
                return response("unapproveCourse");
            },
            submitCourse: async (...args) => {
                calls.push({ method: "submitCourse", args });
                return response("submitCourse");
            },
            setVisibility: async (...args) => {
                calls.push({ method: "setVisibility", args });
                return response("setVisibility");
            }
        } as any
    });

    return { calls, service };
}

describe("CourseRequestAdapterService", () => {
    it("keeps invalid route course_id handling outside the course mutation workflow", async () => {
        const service = new CourseRequestAdapterService();

        await expect(service.updateCourseById({
            user,
            params: { courseId: "bad-id" },
            body: { course_name: "Updated" }
        })).resolves.toEqual({
            code: 400,
            message: "Invalid course_id format",
            body: undefined
        });
    });

    it("normalizes body courseId validation for lifecycle adapters", async () => {
        const service = new CourseRequestAdapterService();

        await expect(service.submitCourse({
            user,
            body: { courseId: "bad-id" }
        })).resolves.toEqual({
            code: 400,
            message: "Invalid course_id format",
            body: undefined
        });
    });

    it("maps read and list route inputs to course workflows", async () => {
        const { calls, service } = makeService();
        const params = { courseId };

        await service.getCourseById({ user, params });
        await service.getCourseMenu({ user, params });
        await service.getFirstTemplateByCourseID({ user, params });
        await service.listPublicCourses();
        await service.listAllCourses();
        await service.listSubmittedCourses();

        expect(calls).toEqual([
            { method: "getCoursePage", args: [{ user, courseId }] },
            { method: "getCourseMenu", args: [{ user, courseId }] },
            { method: "getFirstTemplate", args: [{ user, courseId }] },
            { method: "listPublicCourses", args: [] },
            { method: "listAllCourses", args: [] },
            { method: "listSubmittedCourses", args: [] }
        ]);
    });

    it("maps create/update/delete route inputs to mutation workflows", async () => {
        const { calls, service } = makeService();
        const body = { course_name: "Course" };

        await service.addCourse({ user, body });
        await service.updateCourseById({ user, params: { courseId }, body });
        await service.deleteCourseById({ user, params: { courseId } });

        expect(calls).toEqual([
            { method: "createCourse", args: [{ user, request: body }] },
            { method: "updateCourse", args: [{ user, courseId, request: body }] },
            { method: "deleteCourse", args: [courseId] }
        ]);
    });

    it("maps membership and review route inputs to their workflows", async () => {
        const { calls, service } = makeService();
        const body = { courseId, rating: 5, content: "good" };
        const query = { course_id: courseId };
        const params = { courseId, review_id: "review-1" };

        await service.joinCourseById({ user, params });
        await service.inviteToJoinCourse({ user, body });
        await service.rateCourse({ user, body });
        await service.getCourseReviews({ user, query });
        await service.updateCourseReview({ user, params, body });
        await service.deleteCourseReview({ user, params, query });

        expect(calls).toEqual([
            { method: "joinCourse", args: [{ user, courseId }] },
            { method: "inviteUsers", args: [{ actor: user, request: body }] },
            { method: "createReview", args: [{ user, request: body }] },
            { method: "listReviews", args: [{ user, request: query }] },
            { method: "updateReview", args: [{ user, request: { ...body, review_id: "review-1" } }] },
            { method: "deleteReview", args: [{ user, request: { ...query, review_id: "review-1" } }] }
        ]);
    });

    it("maps lifecycle route inputs to lifecycle workflows", async () => {
        const { calls, service } = makeService();

        await service.approveCourseById({ user, params: { courseId } });
        await service.unapproveCourseById({ user, params: { courseId } });
        await service.submitCourse({ user, body: { courseId } });
        await service.setCourseStatus({ user, body: { courseId, status: "public" } });

        expect(calls).toEqual([
            { method: "approveCourse", args: [{ courseId, actorUserId: user._id }] },
            { method: "unapproveCourse", args: [{ courseId, actorUserId: user._id }] },
            { method: "submitCourse", args: [{ courseId, actorUserId: user._id }] },
            { method: "setVisibility", args: [{ courseId, status: "public", actorUserId: user._id }] }
        ]);
    });
});
