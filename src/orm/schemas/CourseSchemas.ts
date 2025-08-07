import { model, Schema } from "mongoose";
import { Course } from "../../interfaces/Course/Course";

export const CourseSchemas = new Schema<Course>({
    course_name: { type: String, required: true },
    course_subtitle: { type: String, required: true },
    course_description: { type: String, required: true },
    duration_in_minutes: { type: Number, required: true },
    difficulty: { type: String, required: true },
    reviews: { type: [String], default: [] }, // !temp
    rating: { type: Number, default: 0 },
    class_ids: { type: [String], default: [], ref: 'classes' },
    update_date: { type: Date },
    submitter_user_id: { type: String, required: true },
    update_log: { type: [String], default: [] }, // !temp
    status: {type: String, enum: ["公開", "未公開", "編輯中", "審核中", "審核未通過"], default: "編輯中"}
});

export const CourseModel = model<Course>('courses', CourseSchemas);