// review + course + class + chapter
export interface CoursePageDTO {
    course_name: string;
    course_subtitle: string;
    course_description: string;
    course_duration_in_minutes: number;
    course_difficulty: "Easy" | "Medium" | "Hard";
    course_rating: number;
    course_reviews: Array<string>; // !temp
    course_submitter_username: string;
    course_submitter_email: string;
    course_submitter_avatar_path: string;
    class_titles: Array<ClassMap>;
}

export interface ClassMap {
    class_order: number;
    class_name: string;
    chapter_titles: Array<ChapterMap>;
}

export interface ChapterMap {
    chapter_order: number;
    chapter_name: string;
}