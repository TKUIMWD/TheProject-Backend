import { describe, expect, it } from "vitest";
import Roles from "../src/enum/role";
import { AIBoxBuildExecutionStatus, AIBoxBuildJobStatus } from "../src/interfaces/AIBoxBuildJob";
import {
    ACTIVE_AI_BOX_BUILD_EXECUTION_STATUSES,
    canAccessAIBoxBuildJob,
    canDeleteAIBoxBuildJob,
    isActiveAIBoxBuildExecutionStatus,
    isStartableAIBoxBuildExecutionStatus,
    STARTABLE_AI_BOX_BUILD_EXECUTION_STATUSES,
    validateAIBoxBuildRunStartState,
    validateAIBoxBuildDirection,
    validateAIBoxBuildMessage,
    validateAIBoxBuildStatusUpdate
} from "../src/modules/ai-box-build/AIBoxBuildJobPolicy";

describe("AIBoxBuildJobPolicy", () => {
    it("validates and trims job direction input", () => {
        expect(validateAIBoxBuildDirection({
            direction: "  Build a realistic Linux web exploitation lab  ",
            constraints: "  Ubuntu latest  "
        })).toEqual({
            valid: true,
            direction: "Build a realistic Linux web exploitation lab",
            constraints: "Ubuntu latest"
        });
    });

    it("rejects invalid direction input with existing messages", () => {
        expect(validateAIBoxBuildDirection({ direction: "short" })).toEqual({
            valid: false,
            message: "direction must be at least 10 characters"
        });

        expect(validateAIBoxBuildDirection({ direction: "x".repeat(8001) })).toEqual({
            valid: false,
            message: "direction exceeds maximum length of 8000 characters"
        });

        expect(validateAIBoxBuildDirection({
            direction: "Build a realistic Linux web exploitation lab",
            constraints: "x".repeat(8001)
        })).toEqual({
            valid: false,
            message: "constraints exceeds maximum length of 8000 characters"
        });
    });

    it("validates update messages", () => {
        expect(validateAIBoxBuildMessage({ message: "  regenerate setup.md  " })).toEqual({
            valid: true,
            message: "regenerate setup.md"
        });

        expect(validateAIBoxBuildMessage({ message: "   " })).toEqual({
            valid: false,
            message: "message is required"
        });

        expect(validateAIBoxBuildMessage({ message: "x".repeat(8001) })).toEqual({
            valid: false,
            message: "message exceeds maximum length of 8000 characters"
        });
    });

    it("validates status updates", () => {
        expect(validateAIBoxBuildStatusUpdate({ status: AIBoxBuildJobStatus.approved })).toEqual({
            valid: true,
            status: AIBoxBuildJobStatus.approved
        });

        expect(validateAIBoxBuildStatusUpdate({ status: "published" })).toEqual({
            valid: false,
            message: "Invalid job status"
        });
    });

    it("allows SuperAdmin or requester to access jobs", () => {
        expect(canAccessAIBoxBuildJob(Roles.SuperAdmin, "user-1", "user-2")).toBe(true);
        expect(canAccessAIBoxBuildJob(Roles.Admin, "user-1", "user-1")).toBe(true);
        expect(canAccessAIBoxBuildJob(Roles.Admin, "user-1", "user-2")).toBe(false);
    });

    it("classifies active and startable execution states", () => {
        expect(ACTIVE_AI_BOX_BUILD_EXECUTION_STATUSES).toContain(AIBoxBuildExecutionStatus.provisioning);
        expect(ACTIVE_AI_BOX_BUILD_EXECUTION_STATUSES).toContain(AIBoxBuildExecutionStatus.verifying);
        expect(STARTABLE_AI_BOX_BUILD_EXECUTION_STATUSES).toEqual([
            AIBoxBuildExecutionStatus.idle,
            AIBoxBuildExecutionStatus.failed,
            AIBoxBuildExecutionStatus.ready_for_review
        ]);
        expect(isActiveAIBoxBuildExecutionStatus(AIBoxBuildExecutionStatus.configuring)).toBe(true);
        expect(isActiveAIBoxBuildExecutionStatus(AIBoxBuildExecutionStatus.failed)).toBe(false);
        expect(isStartableAIBoxBuildExecutionStatus(undefined)).toBe(true);
        expect(isStartableAIBoxBuildExecutionStatus(AIBoxBuildExecutionStatus.ready_for_review)).toBe(true);
        expect(isStartableAIBoxBuildExecutionStatus(AIBoxBuildExecutionStatus.booting)).toBe(false);
    });

    it("blocks deleting running or active execution jobs", () => {
        expect(canDeleteAIBoxBuildJob("job-1", AIBoxBuildExecutionStatus.idle, new Set(["job-1"]))).toEqual({
            allowed: false,
            message: "AI build job is running; stop or wait for it to finish before deleting"
        });
        expect(canDeleteAIBoxBuildJob("job-1", AIBoxBuildExecutionStatus.generating_setup, new Set())).toEqual({
            allowed: false,
            message: "AI build job is running; stop or wait for it to finish before deleting"
        });
        expect(canDeleteAIBoxBuildJob("job-1", AIBoxBuildExecutionStatus.failed, new Set())).toEqual({ allowed: true });
    });

    it("validates run start state with stable conflict messages", () => {
        expect(validateAIBoxBuildRunStartState("job-1", AIBoxBuildExecutionStatus.idle, new Set(["job-1"]))).toEqual({
            allowed: false,
            message: "This AI build job is already running"
        });
        expect(validateAIBoxBuildRunStartState("job-1", AIBoxBuildExecutionStatus.verifying, new Set())).toEqual({
            allowed: false,
            message: "Job is already in execution state: verifying"
        });
        expect(validateAIBoxBuildRunStartState("job-1", undefined, new Set())).toEqual({ allowed: true });
        expect(validateAIBoxBuildRunStartState("job-1", AIBoxBuildExecutionStatus.failed, new Set())).toEqual({ allowed: true });
    });
});
