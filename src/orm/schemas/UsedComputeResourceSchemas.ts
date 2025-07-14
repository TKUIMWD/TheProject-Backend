import {model, Schema} from 'mongoose';
import { UsedComputeResource } from '../../interfaces/UesdComputeResource';

export const UsedComputeResourceSchemas = new Schema<UsedComputeResource>({
    cpu_cores: { type: Number, required: true }, // in cores
    memory: { type: Number, required: true }, // in MB
    storage: { type: Number, required: true } // in GB
});

export const UsedComputeResourceModel = model<UsedComputeResource>('used_compute_resources', UsedComputeResourceSchemas);