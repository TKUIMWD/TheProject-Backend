import { VM_Task, VM_Task_Status, VM_Task_With_PVE_Status } from "../../interfaces/VM/VM_Task";

export type PVERecentTaskStatusFilter = "running" | "completed" | "failed";

export type PVERecentTaskDTO = {
    task_id: string;
    upid?: string;
    node: string;
    vmid?: string;
    action_type: string;
    status: VM_Task_Status;
    start_time?: string;
    end_time?: string;
    progress: number;
    error_message?: string;
};

export function parsePVERecentTaskStatusFilter(value: unknown): {
    valid: boolean;
    queryStatus?: VM_Task_Status | { $in: VM_Task_Status[] };
    normalized?: PVERecentTaskStatusFilter;
    message?: string;
} {
    if (value === undefined || value === null || value === "" || value === "all") {
        return { valid: true };
    }

    if (value === "running") {
        return {
            valid: true,
            normalized: "running",
            queryStatus: { $in: [VM_Task_Status.PENDING, VM_Task_Status.IN_PROGRESS] }
        };
    }

    if (value === "completed") {
        return { valid: true, normalized: "completed", queryStatus: VM_Task_Status.COMPLETED };
    }

    if (value === "failed") {
        return { valid: true, normalized: "failed", queryStatus: VM_Task_Status.FAILED };
    }

    return { valid: false, message: "Invalid task status filter" };
}

export function buildPVERecentTaskDTO(task: VM_Task_With_PVE_Status | VM_Task): PVERecentTaskDTO {
    const firstStep = task.steps?.[0];
    const pveStatus = "pve_status" in task ? task.pve_status : null;
    const endTime = firstStep?.step_end_time
        || ("updated_at" in task && isTerminalTaskStatus(task.status) ? task.updated_at : undefined);
    const errorMessage = firstStep?.error_message
        || (typeof pveStatus?.error === "string" ? pveStatus.error : undefined)
        || (task.status === VM_Task_Status.FAILED && pveStatus?.exitstatus ? `PVE exit status: ${pveStatus.exitstatus}` : undefined);

    return {
        task_id: task.task_id,
        upid: firstStep?.pve_upid,
        node: task.target_node,
        vmid: task.vmid,
        action_type: firstStep?.step_name || pveStatus?.type || "unknown",
        status: task.status,
        start_time: toIsoString(firstStep?.step_start_time || task.created_at),
        end_time: toIsoString(endTime),
        progress: task.progress,
        error_message: errorMessage || undefined
    };
}

function isTerminalTaskStatus(status: VM_Task_Status): boolean {
    return status === VM_Task_Status.COMPLETED
        || status === VM_Task_Status.FAILED
        || status === VM_Task_Status.CANCELLED;
}

function toIsoString(value?: Date): string | undefined {
    if (!value) return undefined;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
