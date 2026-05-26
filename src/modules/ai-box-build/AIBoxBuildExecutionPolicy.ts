import {
    AIBoxBuildExecutionStatus,
    AIBoxBuildJobStatus,
    AIBoxBuildPhase,
    AIBoxBuildProvisioningConfig,
    AIBoxBuildRunLog,
    AIBoxBuildValidationReport
} from "../../interfaces/AIBoxBuildJob";
import { mergeStringArrays } from "./AIBoxBuildArtifactPolicy";
import { appendAIBoxRunLog, buildAIBoxRunLogPushUpdate } from "./AIBoxBuildRunLogPolicy";

export const AI_BOX_BUILD_REVIEW_NEXT_ACTION = "Review generated design.md, setup.md, writeup.md, and validation logs before publishing.";

export type AIBoxBuildRunConfigSnapshot = {
    template_id?: string;
    target?: string;
    name?: string;
    cpuCores?: number;
    memorySize?: number;
    diskSize?: number;
    ciuser?: string;
    cipassword?: string;
    dry_run?: boolean;
};

export function buildAIBoxBuildRunQueuedState(config: AIBoxBuildRunConfigSnapshot): {
    execution_status: AIBoxBuildExecutionStatus;
    phase: AIBoxBuildPhase;
    status: AIBoxBuildJobStatus;
    error_message: string;
    provisioning: AIBoxBuildProvisioningConfig;
    log_message: string;
} {
    const dryRun = Boolean(config.dry_run);
    return {
        execution_status: dryRun ? AIBoxBuildExecutionStatus.generating_setup : AIBoxBuildExecutionStatus.provisioning,
        phase: AIBoxBuildPhase.implementation,
        status: AIBoxBuildJobStatus.awaiting_review,
        error_message: "",
        provisioning: {
            template_id: config.template_id,
            target_node: config.target,
            vm_name: config.name,
            cpu_cores: config.cpuCores,
            memory_mb: config.memorySize,
            disk_gb: config.diskSize,
            ciuser: config.ciuser || "",
            has_cipassword: Boolean(config.cipassword),
            dry_run: dryRun
        },
        log_message: dryRun ? "Dry run queued." : "Build run queued."
    };
}

export function buildAIBoxBuildRunCompletionState(input: {
    dryRun?: boolean;
    nextActions?: unknown[];
}): {
    phase: AIBoxBuildPhase;
    execution_status: AIBoxBuildExecutionStatus;
    status: AIBoxBuildJobStatus;
    error_message: string;
    next_actions: string[];
    log_message: string;
} {
    return {
        phase: AIBoxBuildPhase.verification,
        execution_status: AIBoxBuildExecutionStatus.ready_for_review,
        status: AIBoxBuildJobStatus.awaiting_review,
        error_message: "",
        next_actions: mergeStringArrays([
            ...(input.nextActions || []),
            AI_BOX_BUILD_REVIEW_NEXT_ACTION
        ]),
        log_message: input.dryRun
            ? "Dry run completed; artifacts are ready for review."
            : "VM build run completed and validation passed."
    };
}

export function buildAIBoxBuildRunFailureState(message: string): {
    execution_status: AIBoxBuildExecutionStatus;
    status: AIBoxBuildJobStatus;
    error_message: string;
} {
    return {
        execution_status: AIBoxBuildExecutionStatus.failed,
        status: AIBoxBuildJobStatus.failed,
        error_message: message
    };
}

export function buildAIBoxBuildRunCompletionPersistence(input: {
    dryRun?: boolean;
    nextActions?: unknown[];
    validationReport: AIBoxBuildValidationReport;
    runLogs?: AIBoxBuildRunLog[] | null;
}): {
    validation_report: AIBoxBuildValidationReport;
    phase: AIBoxBuildPhase;
    execution_status: AIBoxBuildExecutionStatus;
    status: AIBoxBuildJobStatus;
    error_message: string;
    next_actions: string[];
    run_logs: AIBoxBuildRunLog[];
} {
    const completionState = buildAIBoxBuildRunCompletionState({
        dryRun: input.dryRun,
        nextActions: input.nextActions
    });

    return {
        validation_report: input.validationReport,
        phase: completionState.phase,
        execution_status: completionState.execution_status,
        status: completionState.status,
        error_message: completionState.error_message,
        next_actions: completionState.next_actions,
        run_logs: appendAIBoxRunLog(input.runLogs, "run", "info", completionState.log_message)
    };
}

export function buildAIBoxBuildRunFailureUpdate(message: string): {
    execution_status: AIBoxBuildExecutionStatus;
    status: AIBoxBuildJobStatus;
    error_message: string;
    updated_at: Date;
    $push: { run_logs: { $each: AIBoxBuildRunLog[]; $slice: number } };
} {
    const failureState = buildAIBoxBuildRunFailureState(message);
    return {
        execution_status: failureState.execution_status,
        status: failureState.status,
        error_message: failureState.error_message,
        updated_at: new Date(),
        ...buildAIBoxRunLogPushUpdate("run", "error", message)
    };
}

export function buildAIBoxBuildValidationBlockedState(message: string): {
    status: AIBoxBuildJobStatus;
    execution_status: AIBoxBuildExecutionStatus;
    error_message: string;
} {
    return {
        status: AIBoxBuildJobStatus.awaiting_review,
        execution_status: AIBoxBuildExecutionStatus.failed,
        error_message: message
    };
}
