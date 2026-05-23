import { model, Schema, Document } from "mongoose";

export interface VMBox extends Document {
    vmtemplate_id: string;
    box_setup_description: string;
    rating_score: number | undefined;
    review_count: number | undefined;
    reviews: string[];
    walkthroughs: string[];
    updated_date: Date;
    update_log: string;
    submitter_user_id: string;
    submitted_date: Date;
    is_public: boolean;
    flag_answers?: { [key: string]: string }; // key: flag_id, value: answer
    allow_ai_assistant?: boolean;
    design_md?: string;
    setup_md?: string;
    writeup_md?: string;
    submitted_box_id?: string;
}

export const VMBoxSchemas = new Schema<VMBox>({
    // VM_Box 特有的欄位
    vmtemplate_id: { type: String, required: true },
    box_setup_description: { type: String, required: true },
    rating_score: { type: Number, default: undefined },
    review_count: { type: Number, default: undefined },
    reviews: { type: [String], default: [] },
    walkthroughs: { type: [String], default: [] },
    updated_date: { type: Date, default: Date.now },
    update_log: { type: String, default: "[]" }, // JSON 格式
    submitter_user_id: { type: String, required: true },
    submitted_date: { type: Date, default: Date.now },
    is_public: { type: Boolean, default: false },
    flag_answers: { type: Map, of: String, default: {} }, // key: flag_id, value: answer
    allow_ai_assistant: { type: Boolean, default: true },
    design_md: { type: String, default: "" },
    setup_md: { type: String, default: "" },
    writeup_md: { type: String, default: "" },
    submitted_box_id: { type: String }
});

export const VMBoxModel = model<VMBox>('vm_boxes', VMBoxSchemas);
