import { sanitizeString } from "../../utils/sanitize";

export type CourseDifficulty = "Easy" | "Medium" | "Hard";

export interface CourseContentFields {
    course_name: string;
    course_subtitle: string;
    course_description: string;
    duration_in_minutes: number;
    difficulty: CourseDifficulty;
}

export type CourseContentUpdate = Partial<CourseContentFields>;

const VALID_DIFFICULTIES: CourseDifficulty[] = ["Easy", "Medium", "Hard"];
export const COURSE_EDITING_STATUS = "編輯中";

export function validateCourseCreateInput(value: Partial<Record<keyof CourseContentFields, unknown>>): { valid: true; fields: CourseContentFields } | { valid: false; message: string } {
    const requiredFields: Array<keyof CourseContentFields> = [
        "course_name",
        "course_subtitle",
        "course_description",
        "duration_in_minutes",
        "difficulty"
    ];
    const missingFields = requiredFields.filter((field) => value[field] === undefined);
    if (missingFields.length > 0) {
        return { valid: false, message: `Missing required fields: ${missingFields.join(', ')}` };
    }

    const baseFields = validateCourseContentFields(value, {
        courseNameMessage: "course_name cannot be empty or strings containing security-sensitive characters",
        durationMessage: "duration_in_minutes must be a non-negative number",
        difficultyMessage: "difficulty must be one of 'Easy', 'Medium', or 'Hard'"
    });
    if (!baseFields.valid) {
        return baseFields;
    }

    return { valid: true, fields: baseFields.fields as CourseContentFields };
}

export function validateCourseUpdateInput(value: Partial<Record<keyof CourseContentFields, unknown>>): { valid: true; updates: CourseContentUpdate } | { valid: false; message: string } {
    const updates = validateCourseContentFields(value, {
        courseNameMessage: "Course name cannot be empty or strings containing security-sensitive characters",
        durationMessage: "duration_in_minutes must be a positive number.",
        difficultyMessage: "difficulty must be one of 'Easy', 'Medium', or 'Hard'."
    });
    if (!updates.valid) {
        return updates;
    }

    if (Object.keys(updates.fields).length === 0) {
        return { valid: false, message: "No valid fields provided for update." };
    }

    return { valid: true, updates: updates.fields };
}

export function buildCourseCreatePayload(input: {
    courseId: string;
    fields: CourseContentFields;
    submitterUserId: string;
    now?: Date;
}): CourseContentFields & {
    _id: string;
    reviews: string[];
    rating: number;
    class_ids: string[];
    update_date: Date;
    submitter_user_id: string;
    status: typeof COURSE_EDITING_STATUS;
} {
    return {
        _id: input.courseId,
        course_name: input.fields.course_name,
        course_subtitle: input.fields.course_subtitle,
        course_description: input.fields.course_description,
        duration_in_minutes: input.fields.duration_in_minutes,
        difficulty: input.fields.difficulty,
        reviews: [],
        rating: 0,
        class_ids: [],
        update_date: input.now || new Date(),
        submitter_user_id: input.submitterUserId,
        status: COURSE_EDITING_STATUS
    };
}

export function buildCourseUpdatePayload(input: {
    updates: CourseContentUpdate;
    now?: Date;
}): CourseContentUpdate & {
    update_date: Date;
    status: typeof COURSE_EDITING_STATUS;
} {
    return {
        ...input.updates,
        update_date: input.now || new Date(),
        status: COURSE_EDITING_STATUS
    };
}

export function buildCourseMutationResponse(courseId: unknown): { course_id: string } {
    return { course_id: String(courseId) };
}

function validateCourseContentFields(
    value: Partial<Record<keyof CourseContentFields, unknown>>,
    messages: { courseNameMessage: string; durationMessage: string; difficultyMessage: string }
): { valid: true; fields: CourseContentUpdate } | { valid: false; message: string } {
    const fields: CourseContentUpdate = {};

    if (value.course_name !== undefined) {
        const sanitized = sanitizeString(asString(value.course_name));
        if (sanitized.trim() === '') {
            return { valid: false, message: messages.courseNameMessage };
        }
        fields.course_name = sanitized;
    }

    if (value.course_subtitle !== undefined) {
        const sanitized = sanitizeString(asString(value.course_subtitle));
        if (sanitized.trim() === '') {
            return { valid: false, message: "course_subtitle cannot be empty or strings containing security-sensitive characters" };
        }
        fields.course_subtitle = sanitized;
    }

    if (value.course_description !== undefined) {
        const sanitized = sanitizeString(asString(value.course_description));
        if (sanitized.trim() === '') {
            return { valid: false, message: "course_description cannot be empty or strings containing security-sensitive characters" };
        }
        fields.course_description = sanitized;
    }

    if (value.duration_in_minutes !== undefined) {
        if (typeof value.duration_in_minutes !== "number" || value.duration_in_minutes <= 0) {
            return { valid: false, message: messages.durationMessage };
        }
        fields.duration_in_minutes = value.duration_in_minutes;
    }

    if (value.difficulty !== undefined) {
        if (!VALID_DIFFICULTIES.includes(value.difficulty as CourseDifficulty)) {
            return { valid: false, message: messages.difficultyMessage };
        }
        fields.difficulty = value.difficulty as CourseDifficulty;
    }

    return { valid: true, fields };
}

function asString(value: unknown): string {
    return typeof value === "string" ? value : "";
}
