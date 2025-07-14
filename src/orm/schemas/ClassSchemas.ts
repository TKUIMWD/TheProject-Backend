import { model, Schema } from "mongoose";
import { Class } from "../../interfaces/Class/Class";

export const ClassSchemas = new Schema<Class>({
    class_order: { type: Number, required: true },
    class_name: { type: String, required: true },
    chapter_ids: { type: [String], required: true }
});

export const ClassModel = model<Class>('classes', ClassSchemas);