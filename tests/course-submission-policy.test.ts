import { describe, expect, it } from "vitest";
import {
    validateCourseClassIdsForSubmission,
    validateCourseSubmissionReadiness
} from "../src/modules/courses/CourseSubmissionPolicy";

describe("CourseSubmissionPolicy", () => {
    it("requires at least one class id before submission", () => {
        expect(validateCourseClassIdsForSubmission(["class-1"])).toEqual({ valid: true });

        expect(validateCourseSubmissionReadiness([], [])).toEqual({
            valid: false,
            message: "Course must have at least one class before submission"
        });

        expect(validateCourseSubmissionReadiness(undefined, [{ chapter_ids: ["chapter-1"] }])).toEqual({
            valid: false,
            message: "Course must have at least one class before submission"
        });
    });

    it("requires loaded class documents before submission", () => {
        expect(validateCourseSubmissionReadiness(["class-1"], [])).toEqual({
            valid: false,
            message: "Course must have at least one class before submission"
        });
    });

    it("requires at least one chapter across loaded classes", () => {
        expect(validateCourseSubmissionReadiness(["class-1"], [
            { chapter_ids: [] },
            {}
        ])).toEqual({
            valid: false,
            message: "Course must have at least one chapter before submission"
        });
    });

    it("accepts submission-ready courses and reports total chapters", () => {
        expect(validateCourseSubmissionReadiness(["class-1", "class-2"], [
            { chapter_ids: ["chapter-1"] },
            { chapter_ids: ["chapter-2", "chapter-3"] }
        ])).toEqual({
            valid: true,
            totalChapters: 3
        });
    });
});
