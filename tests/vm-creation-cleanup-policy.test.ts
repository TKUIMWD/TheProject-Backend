import { describe, expect, it } from "vitest";
import {
    buildOrphanCloudInitVolume,
    isMissingCloudInitVolumeError,
    selectOldVMTaskIdsForRetention
} from "../src/modules/vm/VMCreationCleanupPolicy";

describe("VMCreationCleanupPolicy", () => {
    it("builds orphan cloud-init volume identifiers for PVE storage content deletion", () => {
        expect(buildOrphanCloudInitVolume("NFS", "120")).toBe("NFS:120/vm-120-cloudinit.qcow2");
        expect(buildOrphanCloudInitVolume("local-lvm", "9001")).toBe("local-lvm:9001/vm-9001-cloudinit.qcow2");
    });

    it("classifies missing cloud-init disk errors as cleanup-safe", () => {
        expect(isMissingCloudInitVolumeError(new Error("404 not found"))).toBe(true);
        expect(isMissingCloudInitVolumeError("volume does not exist")).toBe(true);
        expect(isMissingCloudInitVolumeError("no such file or directory")).toBe(true);
    });

    it("does not hide non-missing cleanup errors", () => {
        expect(isMissingCloudInitVolumeError(new Error("permission denied"))).toBe(false);
        expect(isMissingCloudInitVolumeError("storage timeout")).toBe(false);
    });

    it("selects only tasks beyond the newest retention window", () => {
        expect(selectOldVMTaskIdsForRetention([
            { task_id: "newest" },
            { task_id: "middle" },
            { task_id: "old" },
            { task_id: "oldest" }
        ], 2)).toEqual(["old", "oldest"]);
    });

    it("ignores malformed task IDs and invalid retention limits", () => {
        expect(selectOldVMTaskIdsForRetention([
            { task_id: "keep" },
            { task_id: "" },
            { task_id: 123 },
            { task_id: "delete" }
        ], 1)).toEqual(["delete"]);

        expect(selectOldVMTaskIdsForRetention([{ task_id: "task" }], -1)).toEqual([]);
        expect(selectOldVMTaskIdsForRetention([{ task_id: "task" }], Number.NaN)).toEqual([]);
    });
});
