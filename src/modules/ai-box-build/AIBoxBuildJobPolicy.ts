import Roles from "../../enum/role";
import { AIBoxBuildExecutionStatus, AIBoxBuildJobStatus } from "../../interfaces/AIBoxBuildJob";

export const ACTIVE_AI_BOX_BUILD_EXECUTION_STATUSES: readonly AIBoxBuildExecutionStatus[] = [
    AIBoxBuildExecutionStatus.provisioning,
    AIBoxBuildExecutionStatus.booting,
    AIBoxBuildExecutionStatus.waiting_for_network,
    AIBoxBuildExecutionStatus.generating_setup,
    AIBoxBuildExecutionStatus.configuring,
    AIBoxBuildExecutionStatus.verifying
];

export const STARTABLE_AI_BOX_BUILD_EXECUTION_STATUSES: readonly AIBoxBuildExecutionStatus[] = [
    AIBoxBuildExecutionStatus.idle,
    AIBoxBuildExecutionStatus.failed,
    AIBoxBuildExecutionStatus.ready_for_review
];

export function validateAIBoxBuildDirection(
    value: { direction?: unknown; constraints?: unknown }
): { valid: true; direction: string; constraints: string } | { valid: false; message: string } {
    if (!value.direction || typeof value.direction !== "string" || value.direction.trim().length < 10) {
        return { valid: false, message: "direction must be at least 10 characters" };
    }

    if (value.direction.length > 8000) {
        return { valid: false, message: "direction exceeds maximum length of 8000 characters" };
    }

    if (value.constraints && typeof value.constraints === "string" && value.constraints.length > 8000) {
        return { valid: false, message: "constraints exceeds maximum length of 8000 characters" };
    }

    return {
        valid: true,
        direction: value.direction.trim(),
        constraints: typeof value.constraints === "string" ? value.constraints.trim() : ""
    };
}

export function validateAIBoxBuildMessage(
    value: { message?: unknown }
): { valid: true; message: string } | { valid: false; message: string } {
    if (!value.message || typeof value.message !== "string" || value.message.trim().length === 0) {
        return { valid: false, message: "message is required" };
    }

    if (value.message.length > 8000) {
        return { valid: false, message: "message exceeds maximum length of 8000 characters" };
    }

    return { valid: true, message: value.message.trim() };
}

export function validateAIBoxBuildStatusUpdate(
    value: { status?: unknown }
): { valid: true; status: AIBoxBuildJobStatus } | { valid: false; message: string } {
    if (!Object.values(AIBoxBuildJobStatus).includes(value.status as AIBoxBuildJobStatus)) {
        return { valid: false, message: "Invalid job status" };
    }

    return { valid: true, status: value.status as AIBoxBuildJobStatus };
}

export function canAccessAIBoxBuildJob(
    userRole: unknown,
    userId: unknown,
    requesterUserId: unknown
): boolean {
    if (userRole === Roles.SuperAdmin) {
        return true;
    }

    return typeof userId === "string" &&
        typeof requesterUserId === "string" &&
        requesterUserId === userId;
}

export function isActiveAIBoxBuildExecutionStatus(status: unknown): boolean {
    return ACTIVE_AI_BOX_BUILD_EXECUTION_STATUSES.includes(status as AIBoxBuildExecutionStatus);
}

export function isStartableAIBoxBuildExecutionStatus(status: unknown): boolean {
    return status === undefined || status === null || STARTABLE_AI_BOX_BUILD_EXECUTION_STATUSES.includes(status as AIBoxBuildExecutionStatus);
}

export function canDeleteAIBoxBuildJob(
    jobId: string,
    executionStatus: unknown,
    runningJobIds: ReadonlySet<string>
): { allowed: true } | { allowed: false; message: string } {
    if (runningJobIds.has(jobId) || isActiveAIBoxBuildExecutionStatus(executionStatus)) {
        return { allowed: false, message: "AI build job is running; stop or wait for it to finish before deleting" };
    }
    return { allowed: true };
}

export function validateAIBoxBuildRunStartState(
    jobId: string,
    executionStatus: unknown,
    runningJobIds: ReadonlySet<string>
): { allowed: true } | { allowed: false; message: string } {
    if (runningJobIds.has(jobId)) {
        return { allowed: false, message: "This AI build job is already running" };
    }

    if (!isStartableAIBoxBuildExecutionStatus(executionStatus)) {
        return { allowed: false, message: `Job is already in execution state: ${executionStatus}` };
    }

    return { allowed: true };
}
