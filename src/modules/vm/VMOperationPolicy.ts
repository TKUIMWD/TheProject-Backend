import { validateObjectIdInput } from "../common/ObjectIdPolicy";

export type VMOperation = "boot" | "shutdown" | "poweroff" | "reboot" | "reset";

const RUNNING_REQUIRED_OPERATIONS = new Set<VMOperation>(["shutdown", "poweroff", "reboot", "reset"]);

export interface VMOperationMessages {
    actionLabel: string;
    successLogLabel: string;
    successMessage: string;
    failureMessage: string;
    waitTaskLabel?: string;
    waitFailureMessage?: string;
}

export function canOperateVM(ownerId: string, actorId: string, isSuperAdmin: boolean): boolean {
    return ownerId === actorId || isSuperAdmin;
}

export function validateVMOperationTargetId(value: unknown): { valid: true; vmId: string } | { valid: false; message: string } {
    const result = validateObjectIdInput(value, "VM ID");
    return result.valid
        ? { valid: true, vmId: result.value }
        : result;
}

export function validateVMOperationState(
    operation: VMOperation,
    currentStatus: string
): { allowed: true } | { allowed: false; message: string } {
    if (operation === "boot") {
        return currentStatus === "running"
            ? { allowed: false, message: "VM is already running" }
            : { allowed: true };
    }

    if (!RUNNING_REQUIRED_OPERATIONS.has(operation)) {
        return { allowed: false, message: "Unsupported VM operation" };
    }

    if (currentStatus !== "running") {
        const message = operation === "shutdown" || operation === "poweroff"
            ? "VM is not running"
            : `VM must be running to ${operation}`;
        return { allowed: false, message };
    }

    return { allowed: true };
}

export function getVMOperationMessages(operation: VMOperation): VMOperationMessages {
    switch (operation) {
        case "boot":
            return {
                actionLabel: "start",
                successLogLabel: "started",
                successMessage: "VM started successfully",
                failureMessage: "Failed to start VM",
                waitTaskLabel: "VM start",
                waitFailureMessage: "VM start task failed"
            };
        case "shutdown":
            return {
                actionLabel: "shutdown",
                successLogLabel: "shutdown",
                successMessage: "VM shutdown initiated successfully",
                failureMessage: "Failed to shutdown VM"
            };
        case "poweroff":
            return {
                actionLabel: "poweroff",
                successLogLabel: "powered off",
                successMessage: "VM powered off successfully",
                failureMessage: "Failed to poweroff VM"
            };
        case "reboot":
            return {
                actionLabel: "reboot",
                successLogLabel: "rebooted",
                successMessage: "VM rebooted successfully",
                failureMessage: "Failed to reboot VM"
            };
        case "reset":
            return {
                actionLabel: "reset",
                successLogLabel: "reset",
                successMessage: "VM reset successfully",
                failureMessage: "Failed to reset VM"
            };
    }
}
