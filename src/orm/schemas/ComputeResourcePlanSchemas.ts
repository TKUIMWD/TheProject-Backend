import { model, Schema } from "mongoose";
import { ComputeResourcePlan } from "../../interfaces/ComputeResourcePlan";

export const ComputeResourcePlanSchemas = new Schema<ComputeResourcePlan>({
    name: { type: String, required: true },
    max_cpu_cores_per_vm: { type: Number, required: true },
    max_memory_per_vm: { type: Number, required: true }, // in MB
    max_storage_per_vm: { type: Number, required: true }, // in GB
    max_cpu_cores_sum: { type: Number, required: true }, // in cores
    max_memory_sum: { type: Number, required: true }, // in MB
    max_storage_sum: { type: Number, required: true }, // in GB
    max_vms: { type: Number, required: true }
});

export const ComputeResourcePlanModel = model<ComputeResourcePlan>('compute_resource_plans', ComputeResourcePlanSchemas);