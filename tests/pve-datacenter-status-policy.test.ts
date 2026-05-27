import { describe, expect, it } from "vitest";
import { buildPVEDatacenterNodeStatus } from "../src/modules/pve/PVEDatacenterStatusPolicy";

describe("PVEDatacenterStatusPolicy", () => {
    it("builds datacenter node status DTOs with utilization and uptime", () => {
        expect(buildPVEDatacenterNodeStatus({
            node: "pve-a",
            status: "online",
            id: "node/pve-a",
            cpu: 0.42,
            maxcpu: 8,
            mem: 6 * 1024 ** 3,
            maxmem: 16 * 1024 ** 3,
            disk: 0,
            maxdisk: 0,
            uptime: 90_061
        })).toEqual({
            name: "pve-a",
            online: true,
            address: "node/pve-a",
            cpu_percent: 42,
            memory_percent: 38,
            uptime: {
                days: 1,
                hours: 1,
                minutes: 1,
                seconds: 1
            }
        });
    });

    it("guards utilization when PVE reports zero capacity", () => {
        expect(buildPVEDatacenterNodeStatus({
            node: "pve-b",
            status: "offline",
            id: "node/pve-b",
            cpu: 0.5,
            maxcpu: 0,
            mem: 1024,
            maxmem: 0,
            disk: 0,
            maxdisk: 0,
            uptime: 0
        })).toMatchObject({
            online: false,
            cpu_percent: 0,
            memory_percent: 0,
            uptime: {
                days: 0,
                hours: 0,
                minutes: 0,
                seconds: 0
            }
        });
    });

    it("guards malformed PVE metrics without emitting NaN", () => {
        expect(buildPVEDatacenterNodeStatus({
            status: "offline",
            id: "",
            cpu: Number.NaN,
            maxcpu: Number.NaN,
            mem: Number.NaN,
            maxmem: Number.NaN,
            disk: 0,
            maxdisk: 0,
            uptime: Number.NaN
        })).toEqual({
            name: "unknown",
            online: false,
            address: "unknown",
            cpu_percent: 0,
            memory_percent: 0,
            uptime: {
                days: 0,
                hours: 0,
                minutes: 0,
                seconds: 0
            }
        });
    });
});
