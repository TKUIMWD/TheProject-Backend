import { ComputeResourcePlan } from "../../interfaces/ComputeResourcePlan";
import { UsedComputeResource } from "../../interfaces/UesdComputeResource";

export type VMResourceRequest = {
    cpuCores: number;
    memorySize: number;
    diskSize: number;
};

export type VMResourceUpdateRequest = {
    cpuDelta: number;
    memoryDelta: number;
    diskDelta: number;
    newCpuCores: number;
    newMemorySize: number;
    newDiskSize: number;
};

export type VMResourcePolicyResult = {
    allowed: boolean;
    message: string;
};

export function buildInitialUsedComputeResource(): UsedComputeResource {
    return {
        cpu_cores: 0,
        memory: 0,
        storage: 0
    };
}

export function buildAttachUsedComputeResourceUpdate(resourceId: unknown): { used_compute_resource_id: string } {
    return {
        used_compute_resource_id: String(resourceId)
    };
}

export function buildVMResourceUsageIncrementUpdate(request: VMResourceRequest): {
    $inc: { cpu_cores: number; memory: number; storage: number };
} {
    return {
        $inc: {
            cpu_cores: request.cpuCores,
            memory: request.memorySize,
            storage: request.diskSize
        }
    };
}

export function buildVMResourceReclaimUpdate(input: {
    cpuCores: number;
    memorySize: number | string;
    diskSize?: number | string | null;
}): {
    $inc: { cpu_cores: number; memory: number; storage: number };
} {
    const memorySize = Number(input.memorySize) || 0;
    const diskSize = Number(input.diskSize) || 0;
    return {
        $inc: {
            cpu_cores: -input.cpuCores,
            memory: -memorySize,
            storage: diskSize ? -diskSize : 0
        }
    };
}

export function checkVMCreateResourcePolicy(
    plan: ComputeResourcePlan,
    used: UsedComputeResource,
    request: VMResourceRequest
): VMResourcePolicyResult {
    if (
        request.cpuCores > plan.max_cpu_cores_per_vm ||
        request.memorySize > plan.max_memory_per_vm ||
        request.diskSize > plan.max_storage_per_vm
    ) {
        return {
            allowed: false,
            message: "Requested resources exceed the per VM limits of your compute resource plan"
        };
    }

    if (
        request.cpuCores > plan.max_cpu_cores_sum - used.cpu_cores ||
        request.memorySize > plan.max_memory_sum - used.memory ||
        request.diskSize > plan.max_storage_sum - used.storage
    ) {
        return {
            allowed: false,
            message: "Requested resources exceed the available limits of your compute resource plan"
        };
    }

    return {
        allowed: true,
        message: "Resource limits check passed"
    };
}

export function checkVMUpdateResourcePolicy(
    plan: ComputeResourcePlan,
    used: UsedComputeResource,
    request: VMResourceUpdateRequest
): VMResourcePolicyResult {
    if (
        request.newCpuCores > plan.max_cpu_cores_per_vm ||
        request.newMemorySize > plan.max_memory_per_vm ||
        request.newDiskSize > plan.max_storage_per_vm
    ) {
        return {
            allowed: false,
            message: "New configuration exceeds the per VM limits of your compute resource plan"
        };
    }

    if (request.cpuDelta <= 0 && request.memoryDelta <= 0 && request.diskDelta <= 0) {
        return {
            allowed: true,
            message: "Resource limits check passed"
        };
    }

    if (
        request.cpuDelta > plan.max_cpu_cores_sum - used.cpu_cores ||
        request.memoryDelta > plan.max_memory_sum - used.memory ||
        request.diskDelta > plan.max_storage_sum - used.storage
    ) {
        return {
            allowed: false,
            message: "Requested resource increases exceed the available limits of your compute resource plan"
        };
    }

    return {
        allowed: true,
        message: "Resource limits check passed"
    };
}
