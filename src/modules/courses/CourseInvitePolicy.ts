import { validateObjectIdInput } from "../common/ObjectIdPolicy";
import { normalizeIdList } from "./CourseAccessPolicy";

export function validateCourseInviteRequest(
    value: { course_id?: unknown; emails?: unknown }
): { valid: true; courseId: string; emails: string[] } | { valid: false; message: string } {
    if (!value.course_id || !Array.isArray(value.emails) || value.emails.length === 0) {
        return { valid: false, message: "Missing course_id or emails array" };
    }

    const courseIdResult = validateObjectIdInput(value.course_id, "course_id");
    if (!courseIdResult.valid) {
        return { valid: false, message: "Invalid course_id format" };
    }

    const emails = value.emails
        .filter((email): email is string => typeof email === "string")
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email !== "");

    if (emails.length === 0) {
        return { valid: false, message: "Missing course_id or emails array" };
    }

    return {
        valid: true,
        courseId: courseIdResult.value,
        emails: Array.from(new Set(emails))
    };
}

export function selectCourseInviteRecipientEmails(
    requestedEmails: string[],
    users: Array<{ email?: unknown; course_ids?: unknown[] }>,
    courseId: string
): string[] {
    const userByEmail = new Map<string, { course_ids?: unknown[] }>();
    for (const user of users) {
        if (typeof user.email !== "string") continue;
        userByEmail.set(user.email.toLowerCase(), user);
    }

    return requestedEmails.filter((email) => {
        const user = userByEmail.get(email);
        if (!user) return false;
        return !normalizeIdList(user.course_ids).includes(courseId);
    });
}
