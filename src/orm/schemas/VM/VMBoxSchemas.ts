import { model, Schema, Document } from "mongoose";

export interface IVMBox extends Document {
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
}

export const VMBoxSchemas = new Schema<IVMBox>({
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
    is_public: { type: Boolean, default: false }
});

export const VMBoxModel = model<IVMBox>('vm_boxes', VMBoxSchemas);
