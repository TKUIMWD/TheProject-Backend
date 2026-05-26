import { VMConfig } from "../../interfaces/VM/VM";
import { PVEUtils } from "../../utils/PVEUtils";
import { validateCloudInitUpdateInput } from "./VMCloudInitPolicy";

export type VMConfigUpdateResources = {
    currentCpuCores: number;
    currentMemorySize: number;
    currentDiskSize: number;
    newCpuCores: number;
    newMemorySize: number;
    newDiskSize: number;
    cpuDelta: number;
    memoryDelta: number;
    diskDelta: number;
};

export type VMConfigUpdateExecutionPlan = {
    updateName: boolean;
    updateCpu: boolean;
    updateMemory: boolean;
    resizeDisk: boolean;
    updateCloudInit: boolean;
    diskReductionError?: string;
};

export type VMConfigUpdateSuccessBody = {
    task_id: string;
    vm_id: string;
    pve_vmid: string;
    updated_config: {
        cpu_cores: number;
        memory_size: number;
        disk_size: number;
        vm_name?: string;
    };
};

export function validateVMConfigUpdateRequest(input: {
    cpuCores?: unknown;
    memorySize?: unknown;
    diskSize?: unknown;
    vmName?: unknown;
    requestCiuser?: unknown;
    requestCipassword?: unknown;
}): { valid: true; sanitizedVMName?: string } | { valid: false; message: string } {
    if (
        !input.cpuCores
        && !input.memorySize
        && !input.diskSize
        && !input.vmName
        && input.requestCiuser === undefined
        && input.requestCipassword === undefined
    ) {
        return { valid: false, message: "At least one configuration parameter must be provided (cpuCores, memorySize, diskSize, vmName, or cloud-init settings)" };
    }

    const cloudInitUpdateValidation = validateCloudInitUpdateInput({
        requestCiuser: input.requestCiuser,
        requestCipassword: input.requestCipassword
    });
    if (!cloudInitUpdateValidation.valid) {
        return cloudInitUpdateValidation;
    }

    if (input.vmName) {
        if (typeof input.vmName !== "string") {
            return { valid: false, message: "vmName must be a string" };
        }
        const sanitizedVMName = PVEUtils.sanitizeVMName(input.vmName.trim());
        if (!sanitizedVMName) {
            return { valid: false, message: "Invalid VM name: name contains invalid characters or is too long" };
        }
        return { valid: true, sanitizedVMName };
    }

    return { valid: true };
}

export function calculateVMConfigUpdateResources(
    currentVMConfig: VMConfig,
    requested: {
        cpuCores?: number;
        memorySize?: number;
        diskSize?: number;
    }
): VMConfigUpdateResources {
    const currentCpuCores = currentVMConfig.cores || 0;
    const currentMemorySize = Number(currentVMConfig.memory || 0);
    const currentDiskSize = PVEUtils.extractDiskSizeFromConfig(currentVMConfig.scsi0) || 0;

    const newCpuCores = requested.cpuCores || currentCpuCores;
    const newMemorySize = requested.memorySize || currentMemorySize;
    const newDiskSize = requested.diskSize || currentDiskSize;

    return {
        currentCpuCores,
        currentMemorySize,
        currentDiskSize,
        newCpuCores,
        newMemorySize,
        newDiskSize,
        cpuDelta: newCpuCores - currentCpuCores,
        memoryDelta: newMemorySize - currentMemorySize,
        diskDelta: newDiskSize - currentDiskSize
    };
}

export function buildVMConfigUpdateExecutionPlan(input: {
    currentCpuCores: number;
    currentMemorySize: number;
    currentDiskSize: number;
    newCpuCores: number;
    newMemorySize: number;
    newDiskSize: number;
    vmName?: string;
    ciuser?: string;
    cipassword?: string;
}): VMConfigUpdateExecutionPlan {
    return {
        updateName: Boolean(input.vmName),
        updateCpu: input.newCpuCores !== input.currentCpuCores,
        updateMemory: input.newMemorySize !== input.currentMemorySize,
        resizeDisk: input.newDiskSize > input.currentDiskSize,
        updateCloudInit: input.ciuser !== undefined && input.cipassword !== undefined,
        diskReductionError: input.newDiskSize < input.currentDiskSize
            ? "Disk size reduction is not supported"
            : undefined
    };
}

export function buildVMConfigUpdateSuccessBody(input: {
    taskId: string;
    vmId: string;
    pveVmid: string;
    cpuCores: number;
    memorySize: number;
    diskSize: number;
    vmName?: string;
}): VMConfigUpdateSuccessBody {
    const body: VMConfigUpdateSuccessBody = {
        task_id: input.taskId,
        vm_id: input.vmId,
        pve_vmid: input.pveVmid,
        updated_config: {
            cpu_cores: input.cpuCores,
            memory_size: input.memorySize,
            disk_size: input.diskSize
        }
    };

    if (input.vmName) {
        body.updated_config.vm_name = input.vmName;
    }

    return body;
}
