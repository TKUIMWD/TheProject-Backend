import { describe, expect, it } from "vitest";
import { buildPVEVMInventoryStatus } from "../src/modules/pve/PVEVMInventoryPolicy";

const GiB = 1024 ** 3;

describe("PVEVMInventoryPolicy", () => {
    it("builds VM inventory DTOs with resource percentages and uptime", () => {
        expect(buildPVEVMInventoryStatus({
            id: "qemu/101",
            vmid: 101,
            name: "lab-vm",
            node: "pve-a",
            type: "qemu",
            status: "running",
            template: 0,
            cpu: 0.12,
            maxcpu: 2,
            mem: 2 * GiB,
            maxmem: 8 * GiB,
            disk: 12 * GiB,
            maxdisk: 40 * GiB,
            uptime: 90_061
        })).toEqual({
            id: "qemu/101",
            vmid: 101,
            name: "lab-vm",
            node: "pve-a",
            type: "qemu",
            status: "running",
            template: false,
            cpu_percent: 12,
            memory_used_gb: 2,
            memory_total_gb: 8,
            memory_percent: 25,
            disk_used_gb: 12,
            disk_total_gb: 40,
            disk_percent: 30,
            uptime: {
                days: 1,
                hours: 1,
                minutes: 1,
                seconds: 1
            }
        });
    });

    it("guards malformed VM metrics without returning NaN", () => {
        expect(buildPVEVMInventoryStatus({
            cpu: Number.NaN,
            maxcpu: Number.NaN,
            mem: Number.NaN,
            maxmem: Number.NaN,
            disk: Number.NaN,
            maxdisk: Number.NaN,
            uptime: Number.NaN
        })).toMatchObject({
            id: "unknown",
            vmid: 0,
            name: "unknown",
            node: "unknown",
            type: "unknown",
            status: "unknown",
            cpu_percent: 0,
            memory_percent: 0,
            disk_percent: 0,
            uptime: {
                days: 0,
                hours: 0,
                minutes: 0,
                seconds: 0
            }
        });
    });
});
