export enum AIBoxBuildJobStatus {
    awaiting_review = 'awaiting_review',
    approved = 'approved',
    archived = 'archived',
    failed = 'failed'
}

export enum AIBoxBuildExecutionStatus {
    idle = 'idle',
    provisioning = 'provisioning',
    booting = 'booting',
    waiting_for_network = 'waiting_for_network',
    generating_setup = 'generating_setup',
    configuring = 'configuring',
    verifying = 'verifying',
    ready_for_review = 'ready_for_review',
    failed = 'failed'
}

export enum AIBoxBuildPhase {
    design = 'design',
    implementation = 'implementation',
    verification = 'verification'
}

export interface AIBoxBuildArtifacts {
    design_md: string;
    setup_md: string;
    writeup_md: string;
}

export type AIBoxBuildValidationStatus = 'pass' | 'warning' | 'blocked';

export interface AIBoxBuildValidationReport {
    status: AIBoxBuildValidationStatus;
    blockers: string[];
    warnings: string[];
    passed_checks: string[];
    artifact_checks: {
        design_md: string[];
        setup_md: string[];
        writeup_md: string[];
    };
    requirement_checks: string[];
    generated_at: Date;
}

export interface AIBoxBuildMessage {
    role: 'user' | 'agent';
    content: string;
    created_at: Date;
}

export interface AIBoxBuildRunLog {
    stage: string;
    level: 'info' | 'warning' | 'error';
    message: string;
    created_at: Date;
}

export interface AIBoxBuildProvisioningConfig {
    template_id?: string;
    target_node?: string;
    vm_name?: string;
    cpu_cores?: number;
    memory_mb?: number;
    disk_gb?: number;
    ciuser?: string;
    has_cipassword?: boolean;
    dry_run?: boolean;
}

export interface AIBoxBuildJob {
    _id?: string;
    requester_user_id: string;
    requester_role: string;
    direction: string;
    constraints?: string;
    allow_ai_assistant: boolean;
    status: AIBoxBuildJobStatus;
    phase: AIBoxBuildPhase;
    summary: string;
    current_understanding: string[];
    open_questions: string[];
    risks: string[];
    next_actions: string[];
    artifacts: AIBoxBuildArtifacts;
    validation_report: AIBoxBuildValidationReport;
    messages: AIBoxBuildMessage[];
    execution_status?: AIBoxBuildExecutionStatus;
    provisioning?: AIBoxBuildProvisioningConfig;
    vm_id?: string;
    pve_vmid?: string;
    pve_node?: string;
    task_id?: string;
    vm_ip?: string;
    workspace_path?: string;
    opencode_model?: string;
    setup_exit_code?: number;
    validation_exit_code?: number;
    run_logs?: AIBoxBuildRunLog[];
    error_message?: string;
    created_at: Date;
    updated_at: Date;
}

export interface AIBoxBuildJobDTO extends AIBoxBuildJob {
    _id: string;
}
