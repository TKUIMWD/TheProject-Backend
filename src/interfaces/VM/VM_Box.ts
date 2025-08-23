import { VM_Template } from "./VM_Template";

export interface VM_Box extends VM_Template {
    box_setup_description: string;
    rating_score: number;
    review_count:number;
    reviews: string[];
    walkthroughs: string[];
    updated_date: Date;
    update_log: string // in json format
}

export interface VM_Box_Info {
    _id?: string;
    name: string | undefined;
    description: string;
    box_setup_description: string;
    submitted_date?: Date;
    updated_date: Date;
    owner: string;
    submitter_user_info?: {
        username: string;
        email: string;
    };
    default_cpu_cores: number;
    default_memory_size: number;
    default_disk_size: number;
    rating_score: number;
    review_count:number;
    is_public?: boolean; // 是否為公開範本
}