import { model , Schema } from "mongoose";
import { ObjectId } from "mongodb";
import { VM } from "../../../interfaces/VM/VM";

export const VMSchema = new Schema<VM>({
    pve_vmid: { type: String, required: true },
    pve_node: { type: String, required: true },
    owner: { type: String, required: true },
    is_box_vm: { type: Boolean, default: false },
    box_id: { type: String },
    answer_record: { type: String },
    fromTemplateId: { type: String } 

});

export const VMModel = model<VM>('vms', VMSchema);