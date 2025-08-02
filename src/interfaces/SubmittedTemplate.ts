export enum SubmittedTemplateStatus {
    not_approved = 'not_approved',
    approved = 'approved',
    rejected = 'rejected'
}

export interface SubmittedTemplate {
    _id?: string;
    status: SubmittedTemplateStatus;
    template_id: string;
    submitter_user_id: string;
    submitted_date: Date;
    status_updated_date?: Date;
    reject_reason?: string;
}