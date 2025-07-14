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
    template_vmid: string;
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