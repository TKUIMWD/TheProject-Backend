export interface VM_Template {
    _id?: string;
    description: string;
    pve_vmid: string;
    pve_node: string;
    submitter_user_id?: string;
    submitted_date?: Date;
    owner: string;
    ciuser: string;
    cipassword: string;
    is_public?: boolean;
}

export interface VM_Template_Info {
    _id?: string;
    name: string | undefined;
    description: string;
    submitted_date?: Date;
    owner: string;
    submitter_user_info?: {
        username: string;
        email: string;
    };
    default_cpu_cores: number;
    default_memory_size: number;
    default_disk_size: number;
    is_public?: boolean; // 是否為公開範本
}