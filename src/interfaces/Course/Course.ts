export interface Course {
    _id?: string,
    course_name: string,
    course_subtitle: string,
    course_description: string,
    duration_in_minutes: number,
    difficulty: string,
    reviews: Array<string>, // !temp
    rating: number,
    class_ids: Array<string>,
    update_date: Date,
    submitter_user_id: string,
    update_log: Array<String>, // !temp
}

export interface CourseInfo {
    course_name: string,
    duration_in_minutes: number,
    difficulty: string,
    rating: number,
    teacher_name: string,
    update_date: Date
}