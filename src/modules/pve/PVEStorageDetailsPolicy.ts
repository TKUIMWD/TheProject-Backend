import { PVE_StorageResource, StorageDetailsStatus } from "../../interfaces/ApiEndPoints";

const SHARED_STORAGE_TYPES = ["nfs", "cifs", "glusterfs", "cephfs", "rbd", "iscsi", "iscsidirect"];

export function finiteStorageNumber(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function getPVEStorageName(storage: PVE_StorageResource): string {
    return storage.storage || storage.name || storage.id || storage.volid || "";
}

export function isPVESharedStorage(storage: PVE_StorageResource): boolean {
    return storage.shared === true
        || storage.shared === 1
        || (!!storage.type && SHARED_STORAGE_TYPES.includes(storage.type));
}

export function getPVEStorageCapacity(storage: PVE_StorageResource): { used: number; total: number } {
    return {
        used: finiteStorageNumber(storage.used) || finiteStorageNumber(storage.disk),
        total: finiteStorageNumber(storage.total) || finiteStorageNumber(storage.maxdisk)
    };
}

export function classifyPVEStorageUsage(usagePercent: number): StorageDetailsStatus["state"] {
    if (usagePercent >= 90) return "critical";
    if (usagePercent >= 80) return "warning";
    return "normal";
}

export function buildPVEStorageDetailsStatus(input: {
    node: string;
    storage: PVE_StorageResource;
}): StorageDetailsStatus | null {
    const name = getPVEStorageName(input.storage);
    const { used, total } = getPVEStorageCapacity(input.storage);
    if (!name || total <= 0) return null;

    const usagePercent = Math.round((used / total) * 100);
    const shared = isPVESharedStorage(input.storage);

    return {
        id: `${input.node}/${name}`,
        node: input.node,
        name,
        type: input.storage.type || "unknown",
        shared,
        used_gb: +(used / 1024 ** 3).toFixed(2),
        total_gb: +(total / 1024 ** 3).toFixed(2),
        used_tb: +(used / 1024 ** 4).toFixed(2),
        total_tb: +(total / 1024 ** 4).toFixed(2),
        usage_percent: Number.isFinite(usagePercent) ? usagePercent : 0,
        state: classifyPVEStorageUsage(usagePercent)
    };
}
