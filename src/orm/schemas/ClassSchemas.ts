import { model, Schema } from "mongoose";
import { Class } from "../../interfaces/Class";
import { ObjectId } from "mongodb";

export const ClassSchemas = new Schema<Class>({
    class_order: { type: Number, required: true },
    class_name: { type: String, required: true },
    class_subtitle: { type: String, required: true },
    chapter_ids: { type: [ObjectId], default: [], ref: 'chapters' },
});

export const ClassModel = model<Class>('classes', ClassSchemas);