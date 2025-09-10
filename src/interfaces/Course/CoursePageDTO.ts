import { SubmitterInfo } from "./SubmitterInfo";

export interface CoursePageDTO {
    _id: string; 
    course_name: string;
    course_subtitle: string;
    course_description: string;
    course_duration_in_minutes: number;
    course_difficulty: "Easy" | "Medium" | "Hard";
    course_rating: number;
    course_reviews: Array<string>; // !temp
    course_update_date: Date;
    class_ids: Array<string>;
    submitterInfo: SubmitterInfo;
    template_id?: string;
}
