import { model, Schema } from 'mongoose';
import { SubmittedBox, SubmittedBoxStatus } from '../../../interfaces/SubmittedBox';

export const SubmittedBoxSchemas = new Schema<SubmittedBox>({
    status: { type: String, required: true, enum: Object.values(SubmittedBoxStatus), default: SubmittedBoxStatus.not_approved },
    vmtemplate_id: { type: String, required: true },
    box_setup_description: { type: String, required: true },
    submitter_user_id: { type: String, required: true },
    submitted_date: { type: Date, required: true, default: Date.now },
    status_updated_date: { type: Date, required: false, default: null },
    reject_reason: { type: String, required: false },
    flag_answers: { type: Map, of: String, default: {} } // key: flag_id, value: answer
});

export const SubmittedBoxModel = model<SubmittedBox>('submitted_boxes', SubmittedBoxSchemas);
