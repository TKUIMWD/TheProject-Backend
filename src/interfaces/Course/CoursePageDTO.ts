import { SubmitterInfo } from "./SubmitterInfo";

export interface CoursePageDTO {
    course_name: string;
    course_subtitle: string;
    course_description: string;
    course_duration_in_minutes: number;
    course_difficulty: "Easy" | "Medium" | "Hard";
    course_rating: number;
    course_reviews: Array<string>; // !temp
    submitterInfo: SubmitterInfo;
}
