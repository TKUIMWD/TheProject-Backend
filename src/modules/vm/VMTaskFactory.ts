import { VM_Task, VM_Task_Status, VM_Task_With_PVE_Status } from "../../interfaces/VM/VM_Task";
import { PVE_TASK_EXIT_STATUS, PVE_TASK_STATUS, PVE_Task_Status_Response } from "../../interfaces/PVE";

export const VM_CREATION_STEP_INDICES = {
    CLONE: 0,
    CPU: 1,
    MEMORY: 2,
    DISK: 3,
    CLOUD_INIT: 4
} as const;

export const VM_UPDATE_CONFIG_STEP_INDICES = {
    NAME: 0,
    CPU: 1,
    MEMORY: 2,
    DISK: 3,
    CLOUD_INIT: 4
} as const;

const VM_CREATION_STEP_NAMES = [
    "Clone VM from Template",
    "Configure CPU Cores",
    "Configure Memory",
    "Resize Disk",
    "Configure Cloud-Init"
] as const;

const VM_UPDATE_STEP_NAMES = [
    "Update VM Name",
    "Configure CPU Cores",
    "Configure Memory",
    "Resize Disk",
    "Configure Cloud-Init"
] as const;

export function buildVMCreationTask(input: {
    templateId: string;
    userId: string;
    vmid: string;
    templateVmid: string;
    targetNode: string;
    now?: Date;
}): VM_Task {
    const now = input.now || new Date();
    return {
        task_id: `clone-${input.templateId}-${now.getTime()}-${input.userId}`,
        user_id: input.userId,
        vmid: input.vmid,
        template_vmid: input.templateVmid,
        target_node: input.targetNode,
        status: VM_Task_Status.PENDING,
        progress: 0,
        created_at: now,
        updated_at: now,
        steps: buildTaskSteps(VM_CREATION_STEP_NAMES, now)
    };
}

export function buildVMUpdateTask(input: {
    vmId: string;
    userId: string;
    pveVmid: string;
    pveNode: string;
    now?: Date;
}): VM_Task {
    const now = input.now || new Date();
    return {
        task_id: `update-${input.vmId}-${now.getTime()}-${input.userId}`,
        user_id: input.userId,
        vmid: input.pveVmid,
        target_node: input.pveNode,
        status: VM_Task_Status.PENDING,
        progress: 0,
        created_at: now,
        updated_at: now,
        steps: buildTaskSteps(VM_UPDATE_STEP_NAMES, now)
    };
}

export function buildVMTaskStatusUpdate(
    status: VM_Task_Status,
    upid?: string,
    errorMessage?: string,
    now: Date = new Date()
): Record<string, unknown> {
    const updateData: Record<string, unknown> = {
        status,
        updated_at: now
    };

    if (upid) {
        updateData.upid = upid;
    }

    if (errorMessage) {
        updateData.error_message = errorMessage;
    }

    return updateData;
}

export function buildVMTaskStepUpdate(
    stepIndex: number,
    status: VM_Task_Status,
    upid?: string,
    errorMessage?: string,
    now: Date = new Date()
): Record<string, unknown> {
    const updateData: Record<string, unknown> = {
        [`steps.${stepIndex}.step_status`]: status,
        [`steps.${stepIndex}.step_end_time`]: now
    };

    if (upid) {
        updateData[`steps.${stepIndex}.pve_upid`] = upid;
    }

    if (errorMessage) {
        updateData[`steps.${stepIndex}.error_message`] = errorMessage;
    }

    return updateData;
}

export function buildVMTaskPVERefreshDecision(
    task: Pick<VM_Task, "status" | "progress">,
    pveStatus: PVE_Task_Status_Response,
    now: Date = new Date()
): {
    shouldUpdate: true;
    status: VM_Task_Status;
    progress: number;
    updateData: Record<string, unknown>;
} | { shouldUpdate: false } {
    if (pveStatus.error) {
        return { shouldUpdate: false };
    }

    let newStatus = task.status;
    let newProgress = task.progress;

    if (pveStatus.status === PVE_TASK_STATUS.RUNNING) {
        newStatus = VM_Task_Status.IN_PROGRESS;
        newProgress = pveStatus.progress || 0;
    } else if (pveStatus.status === PVE_TASK_STATUS.STOPPED) {
        if (pveStatus.exitstatus === PVE_TASK_EXIT_STATUS.OK) {
            newStatus = VM_Task_Status.COMPLETED;
            newProgress = 100;
        } else if (pveStatus.exitstatus === null) {
            newStatus = VM_Task_Status.IN_PROGRESS;
        } else {
            newStatus = VM_Task_Status.FAILED;
        }
    }

    if (newStatus === task.status && newProgress === task.progress) {
        return { shouldUpdate: false };
    }

    const updateData: Record<string, unknown> = {
        status: newStatus,
        progress: newProgress,
        updated_at: now,
        "steps.0.step_status": newStatus,
        "steps.0.step_end_time": pveStatus.endtime ? new Date(pveStatus.endtime * 1000) : undefined
    };

    if (newStatus === VM_Task_Status.FAILED && pveStatus.exitstatus && pveStatus.exitstatus !== PVE_TASK_EXIT_STATUS.OK) {
        updateData["steps.0.error_message"] = pveStatus.exitstatus;
    }

    return {
        shouldUpdate: true,
        status: newStatus,
        progress: newProgress,
        updateData
    };
}

export function buildVMTaskWithPVEStatusDTO(
    task: VM_Task,
    pveStatus: PVE_Task_Status_Response | null = null
): VM_Task_With_PVE_Status {
    return {
        task_id: task.task_id,
        vmid: task.vmid,
        template_vmid: task.template_vmid,
        target_node: task.target_node,
        status: task.status,
        progress: task.progress,
        created_at: task.created_at,
        updated_at: task.updated_at,
        steps: task.steps,
        pve_status: pveStatus
    };
}

function buildTaskSteps(stepNames: readonly string[], now: Date): VM_Task["steps"] {
    return stepNames.map((stepName, index) => ({
        step_name: stepName,
        pve_upid: "PENDING",
        step_status: VM_Task_Status.PENDING,
        step_message: "",
        step_start_time: index === 0 ? now : undefined,
        step_end_time: undefined,
        error_message: ""
    }));
}
