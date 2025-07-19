import { PVE_Task_Status_Response } from '../PVE';

export enum VM_Task_Status {
    PENDING = "pending",
    IN_PROGRESS = "in_progress",
    COMPLETED = "completed",
    FAILED = "failed",
    CANCELLED = "cancelled"
}

export interface VM_Task {
    _id?: string;
    task_id: string; // Unique identifier for the task
    user_id: string;
    vmid: string;
    template_vmid?: string; // Optional for update operations
    target_node: string;
    status: VM_Task_Status; 
    progress: number;
    created_at: Date;
    updated_at: Date;
    steps ?: Array<{
        step_name: string;
        pve_upid: string; // Unique identifier for the step
        step_status: VM_Task_Status; // Status of the step
        step_message?: string; // Optional field for step-specific messages
        step_start_time?: Date; // Optional field for step start time
        step_end_time?: Date; // Optional field for step end time
        error_message?: string; // Optional field for error messages
    }>;
}

export interface VM_Task_Update {
    status?: VM_Task_Status;
    progress?: number;
    updated_at?: Date;
    'steps.0.step_status'?: VM_Task_Status;
    'steps.0.step_end_time'?: Date;
    'steps.0.error_message'?: string;
}

export interface VM_Task_Step_Update {
    updated_at?: Date;
    [key: string]: any; // 用於動態的 steps.${stepIndex}.xxx 欄位
}

export interface VM_Task_With_PVE_Status {
    task_id: string;
    vmid: string;
    template_vmid?: string; // Optional for update operations
    target_node: string;
    status: VM_Task_Status;
    progress: number;
    created_at: Date;
    updated_at: Date;
    steps?: Array<{
        step_name: string;
        pve_upid: string;
        step_status: VM_Task_Status;
        step_message?: string;
        step_start_time?: Date;
        step_end_time?: Date;
        error_message?: string;
    }>;
    pve_status: PVE_Task_Status_Response | null; // PVE 狀態可能有各種不同的結構
}

export interface VM_Task_Query {
    user_id: string;
    status?: VM_Task_Status;
}

export interface VM_Task_Query_With_Pagination extends VM_Task_Query {
    page?: number;
    limit?: number;
    skip?: number;
}