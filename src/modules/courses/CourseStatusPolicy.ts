export type CourseStatus = "公開" | "未公開" | "編輯中" | "審核中" | "審核未通過";
export type CourseVisibilityStatus = "公開" | "未公開";

export function validateCourseVisibilityStatus(value: unknown): { valid: true; status: CourseVisibilityStatus } | { valid: false; message: string } {
    if (value !== "公開" && value !== "未公開") {
        return { valid: false, message: "Status must be either '公開' or '未公開'" };
    }

    return { valid: true, status: value };
}

export function validateCourseReviewableStatus(currentStatus: unknown): { valid: true } | { valid: false; message: string } {
    if (currentStatus !== "審核中") {
        return { valid: false, message: "Course is not in '審核中' status" };
    }

    return { valid: true };
}

export function validateCourseVisibilityTransition(
    currentStatus: unknown,
    nextStatus: CourseVisibilityStatus
): { valid: true } | { valid: false; message: string } {
    if (nextStatus === "公開" && currentStatus !== "未公開") {
        return { valid: false, message: "Only courses with status '未公開' can be set to '公開'" };
    }

    return { valid: true };
}
