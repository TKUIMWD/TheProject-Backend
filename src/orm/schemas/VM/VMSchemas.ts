import { model , Schema } from "mongoose";
import { ObjectId } from "mongodb";
import { VM } from "../../../interfaces/VM/VM";

export const VMSchema = new Schema<VM>({
    pve_vmid: { type: String, required: true },
    pve_node: { type: String, required: true },
    owner: { type: String, required: true },
});

export const VMModel = model<VM>('vms', VMSchema);