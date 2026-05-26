import { AIBoxBuildJob, AIBoxBuildRunLog } from "../../interfaces/AIBoxBuildJob";

type StaleJobInput = Pick<AIBoxBuildJob, "_id" | "run_logs" | "updated_at">;

export function latestAIBoxRunLogAt(runLogs: AIBoxBuildRunLog[] | undefined): Date | null {
    return (runLogs || []).reduce<Date | null>((latest, log) => {
        const createdAt = log?.created_at ? new Date(log.created_at) : null;
        if (!createdAt || Number.isNaN(createdAt.getTime())) return latest;
        if (!latest || createdAt > latest) return createdAt;
        return latest;
    }, null);
}

export function aiBoxBuildLastActivityAt(job: StaleJobInput): Date {
    return latestAIBoxRunLogAt(job.run_logs) || (job.updated_at ? new Date(job.updated_at) : new Date(0));
}

export function selectStaleAIBoxBuildJobIds(
    jobs: StaleJobInput[],
    cutoff: Date,
    runningJobIds: Set<string>
): string[] {
    const staleIds: string[] = [];
    for (const job of jobs) {
        const id = String((job as any)._id);
        if (runningJobIds.has(id)) continue;
        if (aiBoxBuildLastActivityAt(job) < cutoff) staleIds.push(id);
    }
    return staleIds;
}

export function buildAIBoxBuildStaleRunMessage(staleAfterMs: number): string {
    return `AI build worker appears stalled or was interrupted; no execution activity for more than ${Math.round(staleAfterMs / 60000)} minutes. Restart the run after reviewing VM/artifact state.`;
}
