import { PVEResp } from "../../interfaces/Response/PVEResp";
import { VMDeletionResponse } from "../../interfaces/Response/VMResp";

export type VMDeletionResponseDecision =
    | { success: true; mode: "task"; taskId: string }
    | { success: true; mode: "immediate" }
    | { success: false; errorMessage: string };

export function canDeleteVMByOwnership(input: {
    tokenRole: string;
    ownedVmIds: string[];
    vmId: string;
}): { allowed: true } | { allowed: false; message: string } {
    if (input.tokenRole === "superadmin") {
        return { allowed: true };
    }

    if (input.ownedVmIds.includes(input.vmId)) {
        return { allowed: true };
    }

    return {
        allowed: false,
        message: "Access denied: VM not owned by user"
    };
}

export function checkVMDeletionPowerState(vmStatus: { status?: string } | null | undefined): { allowed: true } | { allowed: false; message: string } {
    if (vmStatus?.status === "running") {
        return {
            allowed: false,
            message: "VM is currently running. Please stop the VM before deletion."
        };
    }

    return { allowed: true };
}

export function buildVMDeletionPVEApiFailureMessage(error: unknown): string {
    if (error instanceof SyntaxError && error.message.includes("JSON")) {
        return `PVE API returned invalid JSON response: ${error.message}`;
    }

    return `PVE API call failed: ${error instanceof Error ? error.message : "Unknown error"}`;
}

export function classifyVMDeletionResponse(deleteResp: PVEResp | null | undefined): VMDeletionResponseDecision {
    if (!deleteResp) {
        return {
            success: false,
            errorMessage: "PVE API returned no response or invalid response"
        };
    }

    if (deleteResp.data === undefined) {
        return {
            success: false,
            errorMessage: "PVE API response missing data property"
        };
    }

    if (typeof deleteResp.data === "string") {
        return {
            success: true,
            mode: "task",
            taskId: deleteResp.data
        };
    }

    if (deleteResp.data === null) {
        return {
            success: true,
            mode: "immediate"
        };
    }

    return {
        success: false,
        errorMessage: `Unexpected PVE API response data type: ${typeof deleteResp.data}`
    };
}

export function buildVMDeletionSuccessResponse(input: {
    vmId: string;
    pveVmid: string;
    pveNode: string;
    taskId?: string;
}): VMDeletionResponse {
    if (input.taskId) {
        return {
            vm_id: input.vmId,
            pve_vmid: input.pveVmid,
            pve_node: input.pveNode,
            task_id: input.taskId,
            message: "VM deletion task completed successfully"
        };
    }

    return {
        vm_id: input.vmId,
        pve_vmid: input.pveVmid,
        pve_node: input.pveNode,
        message: "VM deleted successfully"
    };
}

export function buildVMDeletionErrorResponse(input: {
    vmId: string;
    pveVmid: string;
    pveNode: string;
    error: unknown;
}): VMDeletionResponse {
    return {
        vm_id: input.vmId,
        pve_vmid: input.pveVmid,
        pve_node: input.pveNode,
        message: input.error instanceof Error && input.error.message
            ? input.error.message
            : "Unknown error"
    };
}
