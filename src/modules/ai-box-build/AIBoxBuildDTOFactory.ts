import {
    AIBoxBuildExecutionStatus,
    AIBoxBuildJob,
    AIBoxBuildJobDTO
} from "../../interfaces/AIBoxBuildJob";
import {
    defaultAIBoxBuildValidationReport,
    normalizeAIBoxBuildArtifacts
} from "./AIBoxBuildArtifactPolicy";

export function buildAIBoxBuildJobDTO(job: AIBoxBuildJob): AIBoxBuildJobDTO {
    const raw = typeof (job as any).toObject === "function" ? (job as any).toObject() : job;
    return {
        ...raw,
        _id: String((job as any)._id),
        artifacts: normalizeAIBoxBuildArtifacts(raw.artifacts, raw.direction),
        validation_report: raw.validation_report || defaultAIBoxBuildValidationReport(),
        current_understanding: raw.current_understanding || [],
        open_questions: raw.open_questions || [],
        risks: raw.risks || [],
        next_actions: raw.next_actions || [],
        messages: raw.messages || [],
        execution_status: raw.execution_status || AIBoxBuildExecutionStatus.idle,
        provisioning: raw.provisioning || {},
        run_logs: raw.run_logs || []
    } as AIBoxBuildJobDTO;
}
