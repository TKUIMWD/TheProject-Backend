import { PVEVMBatchDeleteItemResult, PVEVMBatchDeleteTarget } from "../../interfaces/ApiEndPoints";

const MAX_BATCH_DELETE_TARGETS = 20;

export function validatePVEVMBatchDeleteInput(input: { targets?: unknown }):
    | { valid: true; targets: PVEVMBatchDeleteTarget[] }
    | { valid: false; message: string } {
    if (!Array.isArray(input.targets)) {
        return { valid: false, message: "targets must be an array" };
    }
    if (input.targets.length === 0) {
        return { valid: false, message: "Select at least one VM to delete" };
    }
    if (input.targets.length > MAX_BATCH_DELETE_TARGETS) {
        return { valid: false, message: `Cannot delete more than ${MAX_BATCH_DELETE_TARGETS} VMs at once` };
    }

    const targets: PVEVMBatchDeleteTarget[] = [];
    const seen = new Set<string>();
    for (const [index, rawTarget] of input.targets.entries()) {
        if (!rawTarget || typeof rawTarget !== "object") {
            return { valid: false, message: `target ${index + 1} is invalid` };
        }

        const target = rawTarget as { node?: unknown; vmid?: unknown; name?: unknown };
        const node = typeof target.node === "string" ? target.node.trim() : "";
        const vmid = typeof target.vmid === "string" || typeof target.vmid === "number"
            ? String(target.vmid).trim()
            : "";
        const name = typeof target.name === "string" ? target.name.trim() : undefined;

        if (!node) return { valid: false, message: `target ${index + 1} node is required` };
        if (!/^[A-Za-z0-9_.-]+$/.test(node)) return { valid: false, message: `target ${index + 1} node is invalid` };
        if (!vmid) return { valid: false, message: `target ${index + 1} vmid is required` };
        if (!/^\d+$/.test(vmid)) return { valid: false, message: `target ${index + 1} vmid is invalid` };

        const key = `${node}:${vmid}`;
        if (seen.has(key)) continue;
        seen.add(key);
        targets.push({ node, vmid: Number(vmid), ...(name ? { name } : {}) });
    }

    return { valid: true, targets };
}

export function canDeletePVEVM(input: {
    status?: string;
    template?: unknown;
}): { allowed: true } | { allowed: false; detail: string } {
    if (input.template === 1 || input.template === true) {
        return { allowed: false, detail: "Template VMs cannot be deleted from this panel" };
    }
    if (input.status === "running") {
        return { allowed: false, detail: "VM must be stopped before deletion" };
    }
    return { allowed: true };
}

export function buildPVEVMBatchDeleteItemResult(input: {
    target: PVEVMBatchDeleteTarget;
    ok: boolean;
    detail: string;
    upid?: unknown;
    statusBefore?: string;
}): PVEVMBatchDeleteItemResult {
    return {
        node: input.target.node,
        vmid: input.target.vmid,
        name: input.target.name,
        ok: input.ok,
        detail: input.detail,
        upid: typeof input.upid === "string" ? input.upid : undefined,
        status_before: input.statusBefore
    };
}
