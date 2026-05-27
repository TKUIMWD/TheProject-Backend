import { createResponse, resp } from "../../utils/resp";
import { PVEDashboardTrendStore, pveDashboardTrendStore } from "./PVEDashboardTrendStore";

type PVEDashboardTrendServiceDeps = {
    trendStore?: Pick<PVEDashboardTrendStore, "list">;
};

export class PVEDashboardTrendService {
    private readonly trendStore: Pick<PVEDashboardTrendStore, "list">;

    constructor(deps: PVEDashboardTrendServiceDeps = {}) {
        this.trendStore = deps.trendStore ?? pveDashboardTrendStore;
    }

    public getDashboardTrends(input: { limit?: unknown } = {}): Promise<resp<any>> {
        const limit = this.normalizeLimit(input.limit);
        return Promise.resolve(createResponse(200, "PVE dashboard trends fetched successfully", {
            points: this.trendStore.list(limit),
            retention_points: 288,
            source: "in-process dashboard snapshots"
        }));
    }

    private normalizeLimit(value: unknown): number {
        const parsed = typeof value === "string" || typeof value === "number" ? Number(value) : 48;
        if (!Number.isFinite(parsed)) return 48;
        return Math.min(Math.max(Math.floor(parsed), 1), 288);
    }
}

export const pveDashboardTrendService = new PVEDashboardTrendService();
