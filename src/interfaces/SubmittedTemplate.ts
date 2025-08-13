export enum SubmittedTemplateStatus {
    cancelled = 'cancelled',
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

export interface SubmittedTemplateDetails {
    _id: string;
    status: SubmittedTemplateStatus;
    template_id: string;
    submitter_user_id: string;
    submitted_date: Date;
    status_updated_date?: Date;
    reject_reason?: string;
    template_name: string;
    template_description: string;
    owner: string;
    submitter_user_info?: {
        username: string;
        email: string;
    };
    pve_vmid: string;
    pve_node: string;
    default_cpu_cores: number;
    default_memory_size: number;
    default_disk_size: number;
    cipassword: string;
    ciuser: string;
}