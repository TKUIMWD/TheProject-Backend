import { describe, expect, it } from "vitest";
import {
    AIBoxBuildExecutionStatus,
    AIBoxBuildJobStatus,
    AIBoxBuildPhase
} from "../src/interfaces/AIBoxBuildJob";
import { buildAIBoxBuildJobDTO } from "../src/modules/ai-box-build/AIBoxBuildDTOFactory";

describe("AIBoxBuildDTOFactory", () => {
    it("builds DTOs with defaults for optional arrays and execution data", () => {
        const dto = buildAIBoxBuildJobDTO({
            _id: "job-1",
            requester_user_id: "user-1",
            requester_role: "admin",
            direction: "Build a web lab",
            constraints: "",
            allow_ai_assistant: true,
            status: AIBoxBuildJobStatus.awaiting_review,
            phase: AIBoxBuildPhase.design,
            summary: "summary",
            current_understanding: undefined as any,
            open_questions: undefined as any,
            risks: undefined as any,
            next_actions: undefined as any,
            artifacts: undefined as any,
            validation_report: undefined as any,
            messages: undefined as any,
            created_at: new Date("2026-05-01T00:00:00.000Z"),
            updated_at: new Date("2026-05-01T00:00:00.000Z")
        });

        expect(dto).toMatchObject({
            _id: "job-1",
            artifacts: {
                design_md: "# design.md\n\n## Direction\n\nBuild a web lab",
                setup_md: "# setup.md\n\nPending setup details.",
                writeup_md: "# writeup.md\n\nPending solve path."
            },
            current_understanding: [],
            open_questions: [],
            risks: [],
            next_actions: [],
            messages: [],
            execution_status: AIBoxBuildExecutionStatus.idle,
            provisioning: {},
            run_logs: []
        });
        expect(dto.validation_report.status).toBe("blocked");
    });

    it("uses toObject output for Mongoose-like documents", () => {
        const dto = buildAIBoxBuildJobDTO({
            _id: { toString: () => "job-2" },
            toObject: () => ({
                direction: "Build another lab",
                artifacts: {
                    design_md: "design",
                    setup_md: "setup",
                    writeup_md: "writeup"
                },
                execution_status: AIBoxBuildExecutionStatus.ready_for_review,
                provisioning: { dry_run: true },
                run_logs: [{ stage: "run", level: "info", message: "ok", created_at: new Date("2026-05-01T00:00:00.000Z") }]
            })
        } as any);

        expect(dto).toMatchObject({
            _id: "job-2",
            artifacts: {
                design_md: "design",
                setup_md: "setup",
                writeup_md: "writeup"
            },
            execution_status: AIBoxBuildExecutionStatus.ready_for_review,
            provisioning: { dry_run: true },
            run_logs: [{ stage: "run", level: "info", message: "ok" }]
        });
    });
});
