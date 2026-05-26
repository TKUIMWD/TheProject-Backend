import Roles from "../../enum/role";

export interface CourseAccessContext {
    courseId: string;
    courseStatus?: string;
    submitterUserId?: string;
    userId?: string;
    userRole?: string;
    joinedCourseIds?: unknown[];
}

export function normalizeIdList(values: unknown[] | undefined): string[] {
    return (values || [])
        .map((value: any) => value?.toString?.() ?? "")
        .filter((value) => value !== "");
}

export function isCourseMember(joinedCourseIds: unknown[] | undefined, courseId: string): boolean {
    return normalizeIdList(joinedCourseIds).includes(courseId);
}

export function buildJoinedCourseIds(joinedCourseIds: unknown[] | undefined, courseId: string): string[] {
    return Array.from(new Set([...normalizeIdList(joinedCourseIds), courseId]));
}

export function isCourseOwner(context: CourseAccessContext): boolean {
    return Boolean(context.userId && context.submitterUserId === context.userId);
}

export function isSuperAdmin(role: unknown): boolean {
    return role === Roles.SuperAdmin;
}

export function canAccessJoinedCourse(context: CourseAccessContext): boolean {
    return isCourseMember(context.joinedCourseIds, context.courseId) || isSuperAdmin(context.userRole);
}

export function validateCourseJoinAccess(context: CourseAccessContext): { valid: true } | { valid: false; statusCode: 400 | 403; message: string } {
    if (context.courseStatus !== "公開") {
        return { valid: false, statusCode: 403, message: "You can only join courses that are publicly available" };
    }

    if (isCourseMember(context.joinedCourseIds, context.courseId)) {
        return { valid: false, statusCode: 400, message: "You have already joined this course" };
    }

    return { valid: true };
}

export function canReviewCourse(context: CourseAccessContext): boolean {
    return context.courseStatus === "公開" && (
        isCourseMember(context.joinedCourseIds, context.courseId) ||
        isCourseOwner(context) ||
        isSuperAdmin(context.userRole)
    );
}

export function canViewCourseReviews(context: CourseAccessContext): boolean {
    return context.courseStatus === "公開" ||
        isCourseMember(context.joinedCourseIds, context.courseId) ||
        isCourseOwner(context) ||
        isSuperAdmin(context.userRole);
}

export function canAccessCourseTemplate(context: CourseAccessContext): boolean {
    return isCourseMember(context.joinedCourseIds, context.courseId) ||
        isCourseOwner(context) ||
        isSuperAdmin(context.userRole);
}
