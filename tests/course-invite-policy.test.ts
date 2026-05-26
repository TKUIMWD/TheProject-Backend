import { describe, expect, it } from "vitest";
import {
    selectCourseInviteRecipientEmails,
    validateCourseInviteRequest
} from "../src/modules/courses/CourseInvitePolicy";

const courseId = "507f1f77bcf86cd799439011";

describe("CourseInvitePolicy", () => {
    it("validates and normalizes invite requests", () => {
        expect(validateCourseInviteRequest({
            course_id: ` ${courseId} `,
            emails: [" Alice@Example.COM ", "alice@example.com", "bob@example.com", "", 123]
        })).toEqual({
            valid: true,
            courseId,
            emails: ["alice@example.com", "bob@example.com"]
        });
    });

    it("reports missing fields with the existing message", () => {
        expect(validateCourseInviteRequest({ course_id: courseId, emails: [] })).toEqual({
            valid: false,
            message: "Missing course_id or emails array"
        });

        expect(validateCourseInviteRequest({ emails: ["user@example.com"] })).toEqual({
            valid: false,
            message: "Missing course_id or emails array"
        });
    });

    it("rejects invalid course ids", () => {
        expect(validateCourseInviteRequest({
            course_id: "bad-id",
            emails: ["user@example.com"]
        })).toEqual({
            valid: false,
            message: "Invalid course_id format"
        });
    });

    it("selects existing users that have not already joined the course", () => {
        expect(selectCourseInviteRecipientEmails(
            ["alice@example.com", "bob@example.com", "carol@example.com"],
            [
                { email: "ALICE@example.com", course_ids: [] },
                { email: "bob@example.com", course_ids: [courseId] }
            ],
            courseId
        )).toEqual(["alice@example.com"]);
    });

    it("preserves requested email order after batch user lookup", () => {
        expect(selectCourseInviteRecipientEmails(
            ["first@example.com", "second@example.com"],
            [
                { email: "second@example.com", course_ids: [] },
                { email: "first@example.com", course_ids: [] }
            ],
            courseId
        )).toEqual(["first@example.com", "second@example.com"]);
    });
});
