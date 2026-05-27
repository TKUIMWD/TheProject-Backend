import { describe, expect, it } from "vitest";
import { PVEDashboardTrendStore } from "../src/modules/pve/PVEDashboardTrendStore";
import { PVEDashboardTrendService } from "../src/modules/pve/PVEDashboardTrendService";

describe("PVEDashboardTrendStore", () => {
    it("records bounded dashboard trend snapshots", () => {
        const store = new PVEDashboardTrendStore(2);

        store.record({
            fetched_at: "2026-05-26T00:00:00.000Z",
            overview: { online_nodes: 2, offline_nodes: 1 },
            datacenter: { cpu_percent: 10, memory_percent: 20, storage_percent: 30 }
        });
        store.record({
            fetched_at: "2026-05-26T00:01:00.000Z",
            overview: { online_nodes: 3, offline_nodes: 0 },
            datacenter: { cpu_percent: 40, memory_percent: 50, storage_percent: 60 }
        });
        store.record({
            fetched_at: "2026-05-26T00:02:00.000Z",
            overview: { online_nodes: 4, offline_nodes: 0 },
            datacenter: { cpu_percent: 70, memory_percent: 80, storage_percent: 90 }
        });

        expect(store.list(5)).toEqual([
            {
                timestamp: "2026-05-26T00:01:00.000Z",
                cpu_percent: 40,
                memory_percent: 50,
                storage_percent: 60,
                online_nodes: 3,
                offline_nodes: 0
            },
            {
                timestamp: "2026-05-26T00:02:00.000Z",
                cpu_percent: 70,
                memory_percent: 80,
                storage_percent: 90,
                online_nodes: 4,
                offline_nodes: 0
            }
        ]);
    });

    it("returns trend service DTOs with normalized limits", async () => {
        const service = new PVEDashboardTrendService({
            trendStore: {
                list: (limit) => [{ timestamp: "now", cpu_percent: limit, memory_percent: 0, storage_percent: 0, online_nodes: 1, offline_nodes: 0 }]
            }
        });

        await expect(service.getDashboardTrends({ limit: "bad" })).resolves.toEqual({
            code: 200,
            message: "PVE dashboard trends fetched successfully",
            body: {
                points: [{ timestamp: "now", cpu_percent: 48, memory_percent: 0, storage_percent: 0, online_nodes: 1, offline_nodes: 0 }],
                retention_points: 288,
                source: "in-process dashboard snapshots"
            }
        });
    });
});
