export enum SubmittedBoxStatus {
    not_approved = 'not_approved',
    approved = 'approved',
    rejected = 'rejected'
}

export interface SubmittedBox {
    _id?: string;
    status: SubmittedBoxStatus;
    vmtemplate_id: string;
    box_setup_description: string;
    submitter_user_id: string;
    submitted_date: Date;
    status_updated_date?: Date;
    reject_reason?: string;
    flag_answers?: Record<string, string>; // key: flag_id, value: answer
}

export interface SubmittedBoxDetails extends SubmittedBox {
    template_name: string;
    template_description: string;
    owner: string;
    submitter_user_info: {
        username: string;
        email: string;
    };
    pve_vmid: string;
    pve_node: string;
    default_cpu_cores: number;
    default_memory_size: number;
    default_disk_size: number;
    ciuser: string;
    cipassword: string;
}
