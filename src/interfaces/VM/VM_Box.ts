import { VM_Template, VM_Template_Info } from "./VM_Template";

export interface VM_Box extends VM_Template {
    box_setup_description: string;
    rating_score: number | undefined;
    review_count:number | undefined;
    reviews?: string[];
    walkthroughs?: string[];
    updated_date: Date;
    update_log?: string // in json format
    allow_ai_assistant?: boolean;
    design_md?: string;
    setup_md?: string;
    writeup_md?: string;
    flag_answers?: Record<string, string>;
    submitted_box_id?: string;
    public_writeup_count?: number;
    pending_writeup_count?: number;
}

export interface VM_Box_Info extends VM_Template_Info {
    _id?: string;
    box_setup_description?: string;
    rating_score: number | undefined;
    review_count:number | undefined;
    reviews?: string[];
    walkthroughs?: string[];
    updated_date: Date;
    update_log?: string // in json format
    flag_count?: number;
    reject_reason?: string;
    flag_answers?: Record<string, string>; // key: flag_id, value: answer
    allow_ai_assistant?: boolean;
    design_md?: string;
    setup_md?: string;
    writeup_md?: string;
    submitted_box_id?: string;
    published_box_id?: string;
    public_writeup_count?: number;
    pending_writeup_count?: number;
}
