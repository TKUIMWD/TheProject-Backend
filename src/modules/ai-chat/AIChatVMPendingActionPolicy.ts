export const DEFAULT_PENDING_VM_ACTION_TTL_MS = 5 * 60 * 1000;

export function buildPendingVMActionTiming(
    now: number,
    ttlMs: number = DEFAULT_PENDING_VM_ACTION_TTL_MS
): { createdAt: number; expiresAt: number } {
    return {
        createdAt: now,
        expiresAt: now + ttlMs
    };
}

export function collectExpiredPendingVMActionIds(
    actions: Iterable<[string, { expiresAt?: unknown }]>,
    now: number
): string[] {
    const expiredIds: string[] = [];
    for (const [id, action] of actions) {
        if (typeof action.expiresAt !== "number" || action.expiresAt <= now) {
            expiredIds.push(id);
        }
    }
    return expiredIds;
}
