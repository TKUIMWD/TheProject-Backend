import { describe, expect, it } from "vitest";
import {
    buildJoinedCourseIds,
    canAccessCourseTemplate,
    canAccessJoinedCourse,
    canReviewCourse,
    canViewCourseReviews,
    isCourseMember,
    normalizeIdList,
    validateCourseJoinAccess
} from "../src/modules/courses/CourseAccessPolicy";
import Roles from "../src/enum/role";

const courseId = "course-1";

describe("CourseAccessPolicy", () => {
    it("normalizes course id lists and checks membership", () => {
        expect(normalizeIdList([courseId, { toString: () => "course-2" }, null])).toEqual([courseId, "course-2"]);
        expect(isCourseMember([courseId], courseId)).toBe(true);
        expect(isCourseMember(undefined, courseId)).toBe(false);
    });

    it("builds deduplicated joined-course id updates", () => {
        expect(buildJoinedCourseIds([courseId, { toString: () => "course-2" }, courseId], "course-3")).toEqual([
            courseId,
            "course-2",
            "course-3"
        ]);
        expect(buildJoinedCourseIds([courseId], courseId)).toEqual([courseId]);
    });

    it("allows joined users or SuperAdmin to access joined-course content", () => {
        expect(canAccessJoinedCourse({ courseId, joinedCourseIds: [courseId], userRole: Roles.User })).toBe(true);
        expect(canAccessJoinedCourse({ courseId, joinedCourseIds: [], userRole: Roles.SuperAdmin })).toBe(true);
        expect(canAccessJoinedCourse({ courseId, joinedCourseIds: [], userRole: Roles.User })).toBe(false);
    });

    it("validates course join access with existing messages", () => {
        expect(validateCourseJoinAccess({
            courseId,
            courseStatus: "編輯中",
            joinedCourseIds: []
        })).toEqual({
            valid: false,
            statusCode: 403,
            message: "You can only join courses that are publicly available"
        });

        expect(validateCourseJoinAccess({
            courseId,
            courseStatus: "公開",
            joinedCourseIds: [courseId]
        })).toEqual({
            valid: false,
            statusCode: 400,
            message: "You have already joined this course"
        });
    });

    it("allows reviews only for public courses by members, owners, or SuperAdmin", () => {
        expect(canReviewCourse({
            courseId,
            courseStatus: "公開",
            joinedCourseIds: [courseId],
            userRole: Roles.User
        })).toBe(true);

        expect(canReviewCourse({
            courseId,
            courseStatus: "公開",
            joinedCourseIds: [],
            userId: "owner-1",
            submitterUserId: "owner-1"
        })).toBe(true);

        expect(canReviewCourse({
            courseId,
            courseStatus: "未公開",
            joinedCourseIds: [courseId],
            userRole: Roles.SuperAdmin
        })).toBe(false);
    });

    it("allows review viewing for public courses, members, owners, or SuperAdmin", () => {
        expect(canViewCourseReviews({ courseId, courseStatus: "公開", joinedCourseIds: [] })).toBe(true);
        expect(canViewCourseReviews({ courseId, courseStatus: "未公開", joinedCourseIds: [courseId] })).toBe(true);
        expect(canViewCourseReviews({ courseId, courseStatus: "未公開", userRole: Roles.SuperAdmin })).toBe(true);
        expect(canViewCourseReviews({ courseId, courseStatus: "未公開", joinedCourseIds: [], userRole: Roles.User })).toBe(false);
    });

    it("allows template access for members, owners, and SuperAdmin", () => {
        expect(canAccessCourseTemplate({ courseId, joinedCourseIds: [courseId] })).toBe(true);
        expect(canAccessCourseTemplate({ courseId, userId: "owner-1", submitterUserId: "owner-1" })).toBe(true);
        expect(canAccessCourseTemplate({ courseId, userRole: Roles.SuperAdmin })).toBe(true);
        expect(canAccessCourseTemplate({ courseId, joinedCourseIds: [], userRole: Roles.User })).toBe(false);
    });
});
