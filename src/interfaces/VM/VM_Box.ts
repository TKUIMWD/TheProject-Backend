import { VM_Template, VM_Template_Info } from "./VM_Template";

export interface VM_Box extends VM_Template {
    box_setup_description: string;
    rating_score: number | undefined;
    review_count:number | undefined;
    reviews?: string[];
    walkthroughs?: string[];
    updated_date: Date;
    update_log?: string // in json format
}

export interface VM_Box_Info extends VM_Template_Info {
    _id?: string;
    box_setup_description: string;
    rating_score: number | undefined;
    review_count:number | undefined;
    reviews?: string[];
    walkthroughs?: string[];
    updated_date: Date;
    update_log?: string // in json format
    flag_count?: number;
    reject_reason?: string;
}