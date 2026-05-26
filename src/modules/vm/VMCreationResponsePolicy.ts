export const INVALID_VM_NAME_MESSAGE = "Invalid VM name. Name must contain only alphanumeric characters, hyphens, and dots, and cannot start or end with a hyphen.";
export const VM_CLONE_FAILURE_MESSAGE = "Failed to clone VM from template";
export const VM_CREATION_SUCCESS_MESSAGE = "VM created and configured successfully";
export const VM_CONFIGURATION_CLEANED_UP_FAILURE_MESSAGE = "VM created but configuration failed, resources have been cleaned up";

export function buildVMCreationSuccessBody(input: {
    taskId: string;
    vmName: string;
    vmid: string;
}): { task_id: string; vm_name: string; vmid: string } {
    return {
        task_id: input.taskId,
        vm_name: input.vmName,
        vmid: input.vmid
    };
}
