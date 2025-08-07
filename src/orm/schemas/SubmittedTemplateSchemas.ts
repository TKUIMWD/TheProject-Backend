import {model , Schema} from 'mongoose';
import { SubmittedTemplate , SubmittedTemplateStatus } from '../../interfaces/SubmittedTemplate';

export const SubmittedTemplateSchemas = new Schema<SubmittedTemplate>({
    status: { type: String, required: true, enum: Object.values(SubmittedTemplateStatus), default: SubmittedTemplateStatus.not_approved },
    template_id: { type: String, required: true },
    submitter_user_id: { type: String, required: true },
    submitted_date: { type: Date, required: true, default: Date.now },
    status_updated_date: { type: Date, required: false, default: null },
    reject_reason: { type: String, required: false }
});

export const SubmittedTemplateModel = model<SubmittedTemplate>('submitted_templates', SubmittedTemplateSchemas);