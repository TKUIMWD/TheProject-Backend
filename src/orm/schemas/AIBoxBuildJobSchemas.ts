import { model, Schema } from "mongoose";
import { AIBoxBuildExecutionStatus, AIBoxBuildJob, AIBoxBuildJobStatus, AIBoxBuildPhase } from "../../interfaces/AIBoxBuildJob";

const AIBoxBuildArtifactsSchema = new Schema({
    design_md: { type: String, default: "" },
    setup_md: { type: String, default: "" },
    writeup_md: { type: String, default: "" }
}, { _id: false });

const AIBoxBuildMessageSchema = new Schema({
    role: { type: String, required: true, enum: ['user', 'agent'] },
    content: { type: String, required: true },
    created_at: { type: Date, default: Date.now }
}, { _id: false });

const AIBoxBuildValidationReportSchema = new Schema({
    status: { type: String, required: true, enum: ['pass', 'warning', 'blocked'], default: 'blocked' },
    blockers: { type: [String], default: [] },
    warnings: { type: [String], default: [] },
    passed_checks: { type: [String], default: [] },
    artifact_checks: {
        design_md: { type: [String], default: [] },
        setup_md: { type: [String], default: [] },
        writeup_md: { type: [String], default: [] }
    },
    requirement_checks: { type: [String], default: [] },
    generated_at: { type: Date, default: Date.now }
}, { _id: false });

const AIBoxBuildRunLogSchema = new Schema({
    stage: { type: String, required: true },
    level: { type: String, required: true, enum: ['info', 'warning', 'error'], default: 'info' },
    message: { type: String, required: true },
    created_at: { type: Date, default: Date.now }
}, { _id: false });

const AIBoxBuildProvisioningSchema = new Schema({
    template_id: { type: String, default: "" },
    target_node: { type: String, default: "" },
    vm_name: { type: String, default: "" },
    cpu_cores: { type: Number, default: 0 },
    memory_mb: { type: Number, default: 0 },
    disk_gb: { type: Number, default: 0 },
    ciuser: { type: String, default: "" },
    has_cipassword: { type: Boolean, default: false },
    dry_run: { type: Boolean, default: false }
}, { _id: false });

export const AIBoxBuildJobSchema = new Schema<AIBoxBuildJob>({
    requester_user_id: { type: String, required: true, index: true },
    requester_role: { type: String, required: true },
    direction: { type: String, required: true },
    constraints: { type: String, default: "" },
    allow_ai_assistant: { type: Boolean, default: true },
    status: { type: String, required: true, enum: Object.values(AIBoxBuildJobStatus), default: AIBoxBuildJobStatus.awaiting_review },
    phase: { type: String, required: true, enum: Object.values(AIBoxBuildPhase), default: AIBoxBuildPhase.design },
    summary: { type: String, default: "" },
    current_understanding: { type: [String], default: [] },
    open_questions: { type: [String], default: [] },
    risks: { type: [String], default: [] },
    next_actions: { type: [String], default: [] },
    artifacts: { type: AIBoxBuildArtifactsSchema, default: () => ({}) },
    validation_report: { type: AIBoxBuildValidationReportSchema, default: () => ({}) },
    messages: { type: [AIBoxBuildMessageSchema], default: [] },
    execution_status: { type: String, enum: Object.values(AIBoxBuildExecutionStatus), default: AIBoxBuildExecutionStatus.idle },
    provisioning: { type: AIBoxBuildProvisioningSchema, default: () => ({}) },
    vm_id: { type: String, default: "" },
    pve_vmid: { type: String, default: "" },
    pve_node: { type: String, default: "" },
    task_id: { type: String, default: "" },
    vm_ip: { type: String, default: "" },
    workspace_path: { type: String, default: "" },
    opencode_model: { type: String, default: "" },
    setup_exit_code: { type: Number, default: undefined },
    validation_exit_code: { type: Number, default: undefined },
    run_logs: { type: [AIBoxBuildRunLogSchema], default: [] },
    error_message: { type: String, default: "" },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

AIBoxBuildJobSchema.index({ requester_user_id: 1, updated_at: -1 });
AIBoxBuildJobSchema.index({ execution_status: 1, updated_at: 1 });
AIBoxBuildJobSchema.index({ status: 1, updated_at: -1 });

AIBoxBuildJobSchema.pre('save', function(next) {
    this.updated_at = new Date();
    next();
});

export const AIBoxBuildJobModel = model<AIBoxBuildJob>('ai_box_build_jobs', AIBoxBuildJobSchema);
