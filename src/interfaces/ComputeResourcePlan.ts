export interface ComputeResourcePlan {
    _id?: string;
    name: string;
    max_cpu_cores_per_vm: number;
    max_memory_per_vm: number; // in MB
    max_storage_per_vm: number; // in GB
    max_cpu_cores_sum: number; // in cores
    max_memory_sum: number; // in MB
    max_storage_sum: number; // in GB
    max_vms: number;
}
