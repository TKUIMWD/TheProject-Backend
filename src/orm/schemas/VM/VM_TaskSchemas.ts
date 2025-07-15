import { model , Schema } from "mongoose";
import { VM_Task } from "../../../interfaces/VM/VM_Task";
import { VM_Task_Status } from "../../../interfaces/VM/VM_Task";

export const VM_TaskSchemas = new Schema<VM_Task>({
    task_id: { type: String, required: true },
    user_id: { type: String, required: true },
    vmid: { type: String, required: true },
    template_vmid: { type: String, required: true },
    target_node: { type: String, required: true },
    status: { type: String, enum: Object.values(VM_Task_Status), default: VM_Task_Status.PENDING },
    progress: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
    steps: [{
        step_name: { type: String, required: true },
        pve_upid: { type: String, required: true },
        step_status: { type: String, enum: Object.values(VM_Task_Status), default: VM_Task_Status.PENDING },
        step_message: { type: String, default: '' },
        step_start_time: { type: Date, default: null },
        step_end_time: { type: Date, default: null },
        error_message: { type: String, default: '' }
    }]
});
export const VM_TaskModel = model<VM_Task>('vm_tasks', VM_TaskSchemas);