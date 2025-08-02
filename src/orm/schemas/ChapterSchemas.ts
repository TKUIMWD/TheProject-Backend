import { model, Schema } from "mongoose";
import { Chapter } from "../../interfaces/Chapter/Chapter";

export const ChapterSchemas = new Schema<Chapter>({
    chapter_order: { type: Number, required: true },
    chapter_name: { type: String, required: true },
    chapter_subtitle: { type: String, required: true },
    class_id: { type: String, required: true },
    course_id: { type: String, required: true },
    has_approved_content: { type: String },
    waiting_for_approve_content: { type: String, required: true },
    saved_content: { type: String },
});

export const ChapterModel = model<Chapter>('chapters', ChapterSchemas);