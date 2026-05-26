import { describe, expect, it } from "vitest";
import {
    AIBoxBuildExecutionStatus,
    AIBoxBuildJobStatus,
    AIBoxBuildPhase
} from "../src/interfaces/AIBoxBuildJob";
import {
    AI_BOX_BUILD_REVIEW_NEXT_ACTION,
    buildAIBoxBuildRunCompletionPersistence,
    buildAIBoxBuildRunCompletionState,
    buildAIBoxBuildRunFailureUpdate,
    buildAIBoxBuildRunFailureState,
    buildAIBoxBuildRunQueuedState,
    buildAIBoxBuildValidationBlockedState
} from "../src/modules/ai-box-build/AIBoxBuildExecutionPolicy";

const validationReport = {
    status: "pass" as const,
    blockers: [],
    warnings: [],
    passed_checks: ["ok"],
    artifact_checks: {
        design_md: [],
        setup_md: [],
        writeup_md: []
    },
    requirement_checks: [],
    generated_at: new Date("2026-05-26T00:00:00.000Z")
};

describe("AIBoxBuildExecutionPolicy", () => {
    it("builds queued state for real VM build runs", () => {
        expect(buildAIBoxBuildRunQueuedState({
            template_id: "template-1",
            target: "pve-a",
            name: "ai-box-1",
            cpuCores: 2,
            memorySize: 4096,
            diskSize: 32,
            ciuser: "student",
            cipassword: "secret",
            dry_run: false
        })).toEqual({
            execution_status: AIBoxBuildExecutionStatus.provisioning,
            phase: AIBoxBuildPhase.implementation,
            status: AIBoxBuildJobStatus.awaiting_review,
            error_message: "",
            provisioning: {
                template_id: "template-1",
                target_node: "pve-a",
                vm_name: "ai-box-1",
                cpu_cores: 2,
                memory_mb: 4096,
                disk_gb: 32,
                ciuser: "student",
                has_cipassword: true,
                dry_run: false
            },
            log_message: "Build run queued."
        });
    });

    it("builds queued state for dry runs", () => {
        expect(buildAIBoxBuildRunQueuedState({ dry_run: true })).toMatchObject({
            execution_status: AIBoxBuildExecutionStatus.generating_setup,
            provisioning: {
                ciuser: "",
                has_cipassword: false,
                dry_run: true
            },
            log_message: "Dry run queued."
        });
    });

    it("builds completion state with stable messages and de-duplicated next actions", () => {
        expect(buildAIBoxBuildRunCompletionState({
            dryRun: false,
            nextActions: ["Review generated design.md, setup.md, writeup.md, and validation logs before publishing."]
        })).toEqual({
            phase: AIBoxBuildPhase.verification,
            execution_status: AIBoxBuildExecutionStatus.ready_for_review,
            status: AIBoxBuildJobStatus.awaiting_review,
            error_message: "",
            next_actions: [AI_BOX_BUILD_REVIEW_NEXT_ACTION],
            log_message: "VM build run completed and validation passed."
        });

        expect(buildAIBoxBuildRunCompletionState({ dryRun: true }).log_message).toBe("Dry run completed; artifacts are ready for review.");
    });

    it("builds failure and validation blocked states", () => {
        expect(buildAIBoxBuildRunFailureState("setup.sh failed")).toEqual({
            execution_status: AIBoxBuildExecutionStatus.failed,
            status: AIBoxBuildJobStatus.failed,
            error_message: "setup.sh failed"
        });

        expect(buildAIBoxBuildValidationBlockedState("artifact blocked")).toEqual({
            execution_status: AIBoxBuildExecutionStatus.failed,
            status: AIBoxBuildJobStatus.awaiting_review,
            error_message: "artifact blocked"
        });
    });

    it("builds completion persistence payloads with appended run logs", () => {
        const previousLog = {
            stage: "run",
            level: "info" as const,
            message: "started",
            created_at: new Date("2026-05-26T00:00:00.000Z")
        };

        expect(buildAIBoxBuildRunCompletionPersistence({
            dryRun: true,
            nextActions: [],
            validationReport,
            runLogs: [previousLog]
        })).toMatchObject({
            validation_report: validationReport,
            phase: AIBoxBuildPhase.verification,
            execution_status: AIBoxBuildExecutionStatus.ready_for_review,
            status: AIBoxBuildJobStatus.awaiting_review,
            error_message: "",
            next_actions: [AI_BOX_BUILD_REVIEW_NEXT_ACTION],
            run_logs: [
                previousLog,
                {
                    stage: "run",
                    level: "info",
                    message: "Dry run completed; artifacts are ready for review."
                }
            ]
        });
    });

    it("builds failure persistence updates with run-log push payloads", () => {
        const update = buildAIBoxBuildRunFailureUpdate("validation.sh failed");

        expect(update).toMatchObject({
            execution_status: AIBoxBuildExecutionStatus.failed,
            status: AIBoxBuildJobStatus.failed,
            error_message: "validation.sh failed",
            $push: {
                run_logs: {
                    $each: [{
                        stage: "run",
                        level: "error",
                        message: "validation.sh failed"
                    }],
                    $slice: -200
                }
            }
        });
        expect(update.updated_at).toBeInstanceOf(Date);
    });
});
