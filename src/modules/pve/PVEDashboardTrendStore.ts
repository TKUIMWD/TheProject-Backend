import { PVEDashboardTrendPoint } from "../../interfaces/ApiEndPoints";

const DEFAULT_MAX_POINTS = 288;

export class PVEDashboardTrendStore {
    private points: PVEDashboardTrendPoint[] = [];

    constructor(private readonly maxPoints = DEFAULT_MAX_POINTS) {}

    public record(status: any): void {
        const point: PVEDashboardTrendPoint = {
            timestamp: typeof status?.fetched_at === "string" ? status.fetched_at : new Date().toISOString(),
            cpu_percent: this.finiteNumber(status?.datacenter?.cpu_percent),
            memory_percent: this.finiteNumber(status?.datacenter?.memory_percent),
            storage_percent: this.finiteNumber(status?.datacenter?.storage_percent),
            online_nodes: this.finiteNumber(status?.overview?.online_nodes),
            offline_nodes: this.finiteNumber(status?.overview?.offline_nodes)
        };

        const last = this.points[this.points.length - 1];
        if (last?.timestamp === point.timestamp) {
            this.points[this.points.length - 1] = point;
        } else {
            this.points.push(point);
        }

        if (this.points.length > this.maxPoints) {
            this.points = this.points.slice(-this.maxPoints);
        }
    }

    public list(limit = 48): PVEDashboardTrendPoint[] {
        const safeLimit = Math.min(Math.max(Math.floor(limit), 1), this.maxPoints);
        return this.points.slice(-safeLimit);
    }

    private finiteNumber(value: unknown): number {
        return typeof value === "number" && Number.isFinite(value) ? value : 0;
    }
}

export const pveDashboardTrendStore = new PVEDashboardTrendStore();
