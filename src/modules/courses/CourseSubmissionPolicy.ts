export interface CourseSubmissionClass {
    chapter_ids?: unknown[];
}

export function validateCourseClassIdsForSubmission(
    courseClassIds: unknown[] | undefined,
): { valid: true } | { valid: false; message: string } {
    if (!courseClassIds || courseClassIds.length === 0) {
        return { valid: false, message: "Course must have at least one class before submission" };
    }

    return { valid: true };
}

export function validateCourseSubmissionReadiness(
    courseClassIds: unknown[] | undefined,
    classes: CourseSubmissionClass[] | undefined
): { valid: true; totalChapters: number } | { valid: false; message: string } {
    const classIds = validateCourseClassIdsForSubmission(courseClassIds);
    if (!classIds.valid) {
        return classIds;
    }

    if (!classes || classes.length === 0) {
        return { valid: false, message: "Course must have at least one class before submission" };
    }

    const totalChapters = classes.reduce((count, cls) => {
        return count + (Array.isArray(cls.chapter_ids) ? cls.chapter_ids.length : 0);
    }, 0);

    if (totalChapters === 0) {
        return { valid: false, message: "Course must have at least one chapter before submission" };
    }

    return { valid: true, totalChapters };
}
