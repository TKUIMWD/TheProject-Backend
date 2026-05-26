import { describe, expect, it } from "vitest";
import {
    buildCourseCreatePayload,
    buildCourseMutationResponse,
    buildCourseUpdatePayload,
    COURSE_EDITING_STATUS,
    validateCourseCreateInput,
    validateCourseUpdateInput
} from "../src/modules/courses/CourseContentPolicy";

const validCourse = {
    course_name: "  <b>Web Security</b>  ",
    course_subtitle: "Hands-on labs",
    course_description: "Learn exploit analysis with guided exercises.",
    duration_in_minutes: 120,
    difficulty: "Medium"
};

describe("CourseContentPolicy", () => {
    it("validates and sanitizes create input", () => {
        expect(validateCourseCreateInput(validCourse)).toEqual({
            valid: true,
            fields: {
                course_name: "  <b>Web Security</b>  ",
                course_subtitle: "Hands-on labs",
                course_description: "Learn exploit analysis with guided exercises.",
                duration_in_minutes: 120,
                difficulty: "Medium"
            }
        });
    });

    it("reports missing create fields", () => {
        expect(validateCourseCreateInput({
            course_name: "Web Security",
            duration_in_minutes: 120
        })).toEqual({
            valid: false,
            message: "Missing required fields: course_subtitle, course_description, difficulty"
        });
    });

    it("rejects invalid create values with existing messages", () => {
        expect(validateCourseCreateInput({
            ...validCourse,
            course_name: "<script>bad()</script>"
        })).toEqual({
            valid: false,
            message: "course_name cannot be empty or strings containing security-sensitive characters"
        });

        expect(validateCourseCreateInput({
            ...validCourse,
            duration_in_minutes: 0
        })).toEqual({
            valid: false,
            message: "duration_in_minutes must be a non-negative number"
        });
    });

    it("validates partial update input", () => {
        expect(validateCourseUpdateInput({
            course_subtitle: " Updated subtitle ",
            duration_in_minutes: 60,
            difficulty: "Hard"
        })).toEqual({
            valid: true,
            updates: {
                course_subtitle: " Updated subtitle ",
                duration_in_minutes: 60,
                difficulty: "Hard"
            }
        });
    });

    it("rejects empty updates and invalid update values", () => {
        expect(validateCourseUpdateInput({})).toEqual({
            valid: false,
            message: "No valid fields provided for update."
        });

        expect(validateCourseUpdateInput({ course_name: "<script>bad()</script>" })).toEqual({
            valid: false,
            message: "Course name cannot be empty or strings containing security-sensitive characters"
        });

        expect(validateCourseUpdateInput({ duration_in_minutes: -1 })).toEqual({
            valid: false,
            message: "duration_in_minutes must be a positive number."
        });

        expect(validateCourseUpdateInput({ difficulty: "Extreme" })).toEqual({
            valid: false,
            message: "difficulty must be one of 'Easy', 'Medium', or 'Hard'."
        });
    });

    it("builds course create persistence payloads", () => {
        const now = new Date("2026-05-26T01:02:03.000Z");

        expect(buildCourseCreatePayload({
            courseId: "course-1",
            fields: {
                course_name: "Web Security",
                course_subtitle: "Hands-on labs",
                course_description: "Learn exploit analysis.",
                duration_in_minutes: 120,
                difficulty: "Medium"
            },
            submitterUserId: "user-1",
            now
        })).toEqual({
            _id: "course-1",
            course_name: "Web Security",
            course_subtitle: "Hands-on labs",
            course_description: "Learn exploit analysis.",
            duration_in_minutes: 120,
            difficulty: "Medium",
            reviews: [],
            rating: 0,
            class_ids: [],
            update_date: now,
            submitter_user_id: "user-1",
            status: COURSE_EDITING_STATUS
        });
    });

    it("builds course update payloads that reset status to editing", () => {
        const now = new Date("2026-05-26T01:02:03.000Z");

        expect(buildCourseUpdatePayload({
            updates: {
                course_subtitle: "Updated subtitle",
                duration_in_minutes: 90
            },
            now
        })).toEqual({
            course_subtitle: "Updated subtitle",
            duration_in_minutes: 90,
            update_date: now,
            status: COURSE_EDITING_STATUS
        });
    });

    it("builds stable course mutation response payloads", () => {
        expect(buildCourseMutationResponse(123)).toEqual({ course_id: "123" });
    });
});
