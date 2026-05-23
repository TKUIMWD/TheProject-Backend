import { model, Schema } from 'mongoose';
import { BoxWriteup, BoxWriteupStatus } from '../../../interfaces/BoxWriteup';

export const BoxWriteupSchemas = new Schema<BoxWriteup>({
    box_id: { type: String, required: true, index: true },
    author_user_id: { type: String, required: true, index: true },
    title: { type: String, required: true },
    content_md: { type: String, required: true },
    status: { type: String, required: true, enum: Object.values(BoxWriteupStatus), default: BoxWriteupStatus.pending, index: true },
    is_public: { type: Boolean, default: false, index: true },
    submitted_date: { type: Date, required: true, default: Date.now },
    updated_date: { type: Date, required: true, default: Date.now },
    reviewed_by_user_id: { type: String },
    reviewed_date: { type: Date },
    reject_reason: { type: String }
});

BoxWriteupSchemas.index({ box_id: 1, status: 1, is_public: 1 });
BoxWriteupSchemas.index({ box_id: 1, author_user_id: 1, status: 1 });

export const BoxWriteupModel = model<BoxWriteup>('box_writeup_submissions', BoxWriteupSchemas);
