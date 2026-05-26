import { CourseInfo } from "../../interfaces/Course/Course";

type CourseListSource = {
    _id?: unknown;
    course_name?: string;
    course_subtitle?: string;
    duration_in_minutes?: number;
    difficulty?: string;
    rating?: number;
    update_date?: Date;
    status?: string;
    submitter_user_id?: unknown;
};

type CourseSubmitterSource = {
    _id?: unknown;
    username?: unknown;
};

export function buildCourseInfoDTO(
    course: CourseListSource,
    submitter: CourseSubmitterSource | null | undefined
): CourseInfo | null {
    if (!submitter || typeof submitter.username !== "string") {
        return null;
    }

    return {
        _id: String(course._id),
        course_name: course.course_name || "",
        course_subtitle: course.course_subtitle || "",
        duration_in_minutes: course.duration_in_minutes || 0,
        difficulty: course.difficulty || "",
        rating: course.rating || 0,
        teacher_name: submitter.username,
        update_date: course.update_date || new Date(0),
        status: course.status as CourseInfo["status"]
    };
}

export function buildCourseInfoList(
    courses: CourseListSource[],
    submitters: CourseSubmitterSource[]
): { courses: CourseInfo[]; missingSubmitterCourseIds: string[] } {
    const submitterById = new Map(
        submitters
            .filter((submitter) => submitter._id !== undefined)
            .map((submitter) => [String(submitter._id), submitter])
    );
    const missingSubmitterCourseIds: string[] = [];
    const courseInfos: CourseInfo[] = [];

    for (const course of courses) {
        const submitter = course.submitter_user_id !== undefined
            ? submitterById.get(String(course.submitter_user_id))
            : undefined;
        const courseInfo = buildCourseInfoDTO(course, submitter);
        if (!courseInfo) {
            missingSubmitterCourseIds.push(String(course._id));
            continue;
        }
        courseInfos.push(courseInfo);
    }

    return {
        courses: courseInfos,
        missingSubmitterCourseIds
    };
}

export function collectCourseSubmitterIds(courses: CourseListSource[]): string[] {
    return Array.from(new Set(
        courses
            .map((course) => course.submitter_user_id)
            .filter((id) => id !== undefined && id !== null)
            .map((id) => String(id))
            .filter((id) => id !== "")
    ));
}
