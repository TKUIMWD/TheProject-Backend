export type VMTaskRetentionItem = {
    task_id?: unknown;
};

export function buildOrphanCloudInitVolume(storage: string, pveVmid: string): string {
    return `${storage}:${pveVmid}/vm-${pveVmid}-cloudinit.qcow2`;
}

export function isMissingCloudInitVolumeError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /not found|does not exist|no such|404/i.test(message);
}

export function selectOldVMTaskIdsForRetention(
    tasksNewestFirst: VMTaskRetentionItem[],
    maxTasks: number
): string[] {
    if (!Number.isFinite(maxTasks) || maxTasks < 0) {
        return [];
    }

    return tasksNewestFirst
        .slice(Math.floor(maxTasks))
        .map((task) => task.task_id)
        .filter((taskId): taskId is string => typeof taskId === "string" && taskId.trim() !== "");
}
