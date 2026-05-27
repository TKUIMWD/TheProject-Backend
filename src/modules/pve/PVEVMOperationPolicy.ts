import { PVEVMOperationResult } from "../../interfaces/ApiEndPoints";

export type PVEDashboardVMOperation = "start" | "shutdown" | "reboot" | "stop";

const SUPPORTED_OPERATIONS = new Set<PVEDashboardVMOperation>(["start", "shutdown", "reboot", "stop"]);

export function validatePVEVMOperationInput(input: {
    node?: unknown;
    vmid?: unknown;
    action?: unknown;
}): { valid: true; node: string; vmid: string; action: PVEDashboardVMOperation } | { valid: false; message: string } {
    const node = typeof input.node === "string" ? input.node.trim() : "";
    const vmid = typeof input.vmid === "string" || typeof input.vmid === "number"
        ? String(input.vmid).trim()
        : "";
    const action = typeof input.action === "string" ? input.action.trim().toLowerCase() : "";

    if (!node) return { valid: false, message: "node is required" };
    if (!/^[A-Za-z0-9_.-]+$/.test(node)) return { valid: false, message: "node is invalid" };
    if (!vmid) return { valid: false, message: "vmid is required" };
    if (!/^\d+$/.test(vmid)) return { valid: false, message: "vmid is invalid" };
    if (!SUPPORTED_OPERATIONS.has(action as PVEDashboardVMOperation)) {
        return { valid: false, message: "Unsupported VM operation" };
    }

    return { valid: true, node, vmid, action: action as PVEDashboardVMOperation };
}

export function validatePVEVMOperationState(
    action: PVEDashboardVMOperation,
    currentStatus: string,
): { allowed: true } | { allowed: false; message: string } {
    if (action === "start") {
        return currentStatus === "running"
            ? { allowed: false, message: "VM is already running" }
            : { allowed: true };
    }

    if (currentStatus !== "running") {
        return action === "reboot"
            ? { allowed: false, message: "VM must be running to reboot" }
            : { allowed: false, message: "VM is not running" };
    }

    return { allowed: true };
}

export function getPVEVMOperationSuccessMessage(action: PVEDashboardVMOperation): string {
    switch (action) {
        case "start":
            return "VM start task submitted";
        case "shutdown":
            return "VM shutdown task submitted";
        case "reboot":
            return "VM reboot task submitted";
        case "stop":
            return "VM stop task submitted";
    }
}

export function buildPVEVMOperationResult(input: {
    node: string;
    vmid: string;
    action: PVEDashboardVMOperation;
    upid: unknown;
    statusBefore: string;
}): PVEVMOperationResult {
    return {
        node: input.node,
        vmid: Number(input.vmid),
        action: input.action,
        upid: typeof input.upid === "string" ? input.upid : undefined,
        status_before: input.statusBefore
    };
}
