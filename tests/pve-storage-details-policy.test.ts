import { describe, expect, it } from "vitest";
import {
    buildPVEStorageDetailsStatus,
    classifyPVEStorageUsage,
    isPVESharedStorage
} from "../src/modules/pve/PVEStorageDetailsPolicy";

const GiB = 1024 ** 3;

describe("PVEStorageDetailsPolicy", () => {
    it("projects PVE storage rows into dashboard DTOs", () => {
        expect(buildPVEStorageDetailsStatus({
            node: "pve-a",
            storage: {
                storage: "nfs-labs",
                type: "nfs",
                shared: 1,
                used: 850 * GiB,
                total: 1000 * GiB
            }
        })).toEqual({
            id: "pve-a/nfs-labs",
            node: "pve-a",
            name: "nfs-labs",
            type: "nfs",
            shared: true,
            used_gb: 850,
            total_gb: 1000,
            used_tb: 0.83,
            total_tb: 0.98,
            usage_percent: 85,
            state: "warning"
        });
    });

    it("supports maxdisk/disk capacity fields and critical classification", () => {
        expect(buildPVEStorageDetailsStatus({
            node: "pve-b",
            storage: {
                storage: "thin-a",
                type: "lvmthin",
                shared: 0,
                disk: 92 * GiB,
                maxdisk: 100 * GiB
            }
        })).toMatchObject({
            shared: false,
            usage_percent: 92,
            state: "critical"
        });
    });

    it("drops nameless or zero-capacity storage rows", () => {
        expect(buildPVEStorageDetailsStatus({
            node: "pve-a",
            storage: { type: "dir", total: 100 * GiB, used: 1 * GiB }
        })).toBeNull();
        expect(buildPVEStorageDetailsStatus({
            node: "pve-a",
            storage: { storage: "local", type: "dir", total: 0, used: 0 }
        })).toBeNull();
    });

    it("classifies shared storage by explicit flag or shared type", () => {
        expect(isPVESharedStorage({ storage: "ceph", type: "rbd", shared: 0 })).toBe(true);
        expect(isPVESharedStorage({ storage: "local-zfs", type: "zfspool", shared: 0 })).toBe(false);
    });

    it("uses warning thresholds expected by the dashboard", () => {
        expect(classifyPVEStorageUsage(79)).toBe("normal");
        expect(classifyPVEStorageUsage(80)).toBe("warning");
        expect(classifyPVEStorageUsage(90)).toBe("critical");
    });
});
