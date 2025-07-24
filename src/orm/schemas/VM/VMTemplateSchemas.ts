import { model, Schema } from "mongoose";
import { VM_Template } from "../../../interfaces/VM/VM_Template";

export const VMTemplateSchemas = new Schema<VM_Template>({
    description: { type: String, required: true },
    pve_vmid: { type: String, required: true },
    pve_node: { type: String, required: true },
    submitter_user_id: { type: String, required: false , default: null },
    submitted_date: { type: Date, required:false, default: null },
    owner: { type: String, required: true },
    ciuser: { type: String, required: true },
    cipassword: { type: String, required: true },
    is_public: { type: Boolean, default: false }
});
export const VMTemplateModel = model<VM_Template>('vm_templates', VMTemplateSchemas);