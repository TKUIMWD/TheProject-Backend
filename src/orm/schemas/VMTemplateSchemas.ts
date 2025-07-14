import { model, Schema } from "mongoose";
import { VM_Template } from "../../interfaces/VM/VM_Template";

export const VMTemplateSchemas = new Schema<VM_Template>({
    description: { type: String, required: true },
    pve_vmid: { type: String, required: true },
    pve_node: { type: String, required: true },
    submitter_user_id: { type: String, required: true },
    submitted_date: { type: Date, default: Date.now },
    has_approved: { type: Boolean, default: false },
    ciuser: { type: String, required: true },
    cipassword: { type: String, required: true }
});
export const VMTemplateModel = model<VM_Template>('vm_templates', VMTemplateSchemas);