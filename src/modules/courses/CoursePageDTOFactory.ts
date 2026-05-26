import { CoursePageDTO } from "../../interfaces/Course/CoursePageDTO";

type CoursePageSource = {
    _id?: unknown;
    course_name?: string;
    course_subtitle?: string;
    course_description?: string;
    duration_in_minutes?: number;
    difficulty?: string;
    rating?: number;
    reviews?: string[];
    update_date?: Date;
    class_ids?: string[];
};

type CourseSubmitterSource = {
    username?: string;
    email?: string;
    avatar_path?: string;
};

export function buildCoursePageDTO(course: CoursePageSource, submitter: CourseSubmitterSource): CoursePageDTO {
    return {
        _id: String(course._id),
        course_name: course.course_name as string,
        course_subtitle: course.course_subtitle as string,
        course_description: course.course_description as string,
        course_duration_in_minutes: course.duration_in_minutes as number,
        course_difficulty: course.difficulty as CoursePageDTO["course_difficulty"],
        course_rating: course.rating as number,
        course_reviews: course.reviews || [],
        course_update_date: course.update_date as Date,
        class_ids: course.class_ids || [],
        submitterInfo: {
            username: submitter.username as string,
            email: submitter.email as string,
            avatar_path: submitter.avatar_path as string
        }
    };
}
