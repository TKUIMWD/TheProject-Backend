import { AIBoxBuildRunLog } from "../../interfaces/AIBoxBuildJob";
import { redactSecret } from "../../config/env";

const DEFAULT_PERSISTED_RUN_LOG_LIMIT = 200;
const DEFAULT_IN_MEMORY_PREVIOUS_RUN_LOG_LIMIT = 180;

export function makeAIBoxRunLog(
    stage: string,
    level: AIBoxBuildRunLog["level"],
    message: string,
    options: { maxLength?: number; now?: Date } = {}
): AIBoxBuildRunLog {
    const maxLength = options.maxLength ?? 5000;
    return {
        stage,
        level,
        message: tail(redactSecret(message), maxLength),
        created_at: options.now || new Date()
    };
}

export function appendAIBoxRunLog(
    logs: AIBoxBuildRunLog[] | null | undefined,
    stage: string,
    level: AIBoxBuildRunLog["level"],
    message: string,
    options: { keepPrevious?: number; maxLength?: number; now?: Date } = {}
): AIBoxBuildRunLog[] {
    const keepPrevious = options.keepPrevious ?? DEFAULT_IN_MEMORY_PREVIOUS_RUN_LOG_LIMIT;
    return [
        ...(logs || []).slice(-keepPrevious),
        makeAIBoxRunLog(stage, level, message, options)
    ];
}

export function buildAIBoxRunLogPushUpdate(
    stage: string,
    level: AIBoxBuildRunLog["level"],
    message: string,
    options: { limit?: number; maxLength?: number; now?: Date } = {}
): { $push: { run_logs: { $each: AIBoxBuildRunLog[]; $slice: number } } } {
    const limit = options.limit ?? DEFAULT_PERSISTED_RUN_LOG_LIMIT;
    return {
        $push: {
            run_logs: {
                $each: [makeAIBoxRunLog(stage, level, message, options)],
                $slice: -limit
            }
        }
    };
}

export function tail(value: string, maxLength: number): string {
    return value.length <= maxLength ? value : value.slice(value.length - maxLength);
}
