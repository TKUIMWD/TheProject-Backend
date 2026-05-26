import { describe, expect, it } from "vitest";
import {
    validateCourseReviewableStatus,
    validateCourseVisibilityStatus,
    validateCourseVisibilityTransition
} from "../src/modules/courses/CourseStatusPolicy";

describe("CourseStatusPolicy", () => {
    it("validates public/private visibility status values", () => {
        expect(validateCourseVisibilityStatus("公開")).toEqual({ valid: true, status: "公開" });
        expect(validateCourseVisibilityStatus("未公開")).toEqual({ valid: true, status: "未公開" });
        expect(validateCourseVisibilityStatus("審核中")).toEqual({
            valid: false,
            message: "Status must be either '公開' or '未公開'"
        });
    });

    it("requires reviewable status for approval decisions", () => {
        expect(validateCourseReviewableStatus("審核中")).toEqual({ valid: true });
        expect(validateCourseReviewableStatus("編輯中")).toEqual({
            valid: false,
            message: "Course is not in '審核中' status"
        });
    });

    it("allows publishing only after approval moves a course to unpublished", () => {
        expect(validateCourseVisibilityTransition("未公開", "公開")).toEqual({ valid: true });
        expect(validateCourseVisibilityTransition("公開", "未公開")).toEqual({ valid: true });
        expect(validateCourseVisibilityTransition("審核中", "公開")).toEqual({
            valid: false,
            message: "Only courses with status '未公開' can be set to '公開'"
        });
    });
});
