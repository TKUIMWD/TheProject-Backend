import { pve_api } from "../../enum/PVE_API";
import { PVE_NodeStatus, PVE_StorageResource, StorageDetailsStatus } from "../../interfaces/ApiEndPoints";
import { PVEResp } from "../../interfaces/Response/PVEResp";
import { logger } from "../../middlewares/log";
import { createResponse, resp } from "../../utils/resp";
import { PVEClient, pveClient } from "./PVEClient";
import { buildPVEStorageDetailsStatus } from "./PVEStorageDetailsPolicy";

type PVEStorageDetailsServiceDeps = {
    pve?: Pick<PVEClient, "request">;
};

type StorageTotals = {
    usedGb: number;
    totalGb: number;
};

export class PVEStorageDetailsService {
    private readonly pve: Pick<PVEClient, "request">;

    constructor(deps: PVEStorageDetailsServiceDeps = {}) {
        this.pve = deps.pve ?? pveClient;
    }

    public async getStorageDetails(): Promise<resp<any>> {
        try {
            const nodesResp: PVEResp = await this.pve.request("GET", pve_api.cluster_resources_nodes);
            if (!nodesResp || !Array.isArray(nodesResp.data)) {
                return createResponse(404, "Nodes not found");
            }

            const nodeNames = (nodesResp.data as PVE_NodeStatus[])
                .filter((node) => node.status === "online")
                .map((node) => this.getNodeName(node))
                .filter((nodeName): nodeName is string => !!nodeName);

            const storages = await this.loadStorageRows(nodeNames);
            const overview = this.buildOverview(storages);

            return createResponse(200, "PVE storage details fetched successfully", {
                overview,
                storages: storages.sort((a, b) => b.usage_percent - a.usage_percent || a.node.localeCompare(b.node)),
                fetched_at: new Date().toISOString(),
                source: "nodes/{node}/storage"
            });
        } catch (error) {
            logger.error("Error in PVEStorageDetailsService.getStorageDetails:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    private async loadStorageRows(nodeNames: string[]): Promise<StorageDetailsStatus[]> {
        if (!pve_api.nodes_storage) return [];
        const nodesStorageEndpoint = pve_api.nodes_storage;

        const rows = await Promise.all(nodeNames.map(async (nodeName) => {
            try {
                const storageResp: PVEResp = await this.pve.request("GET", nodesStorageEndpoint(nodeName));
                if (!storageResp || !Array.isArray(storageResp.data)) return [];

                return (storageResp.data as PVE_StorageResource[])
                    .map((storage) => buildPVEStorageDetailsStatus({ node: nodeName, storage }))
                    .filter((storage): storage is StorageDetailsStatus => !!storage);
            } catch (error) {
                logger.error(`Error fetching storage details for node ${nodeName}:`, error);
                return [];
            }
        }));

        return rows.flat();
    }

    private buildOverview(storages: StorageDetailsStatus[]) {
        const totals = new Map<string, StorageTotals>();

        for (const storage of storages) {
            const totalKey = storage.shared ? `shared:${storage.name}` : `local:${storage.node}:${storage.name}`;
            const previous = totals.get(totalKey) || { usedGb: 0, totalGb: 0 };
            totals.set(totalKey, {
                usedGb: storage.shared ? Math.max(previous.usedGb, storage.used_gb) : previous.usedGb + storage.used_gb,
                totalGb: storage.shared ? Math.max(previous.totalGb, storage.total_gb) : previous.totalGb + storage.total_gb
            });
        }

        let usedGb = 0;
        let totalGb = 0;
        for (const value of totals.values()) {
            usedGb += value.usedGb;
            totalGb += value.totalGb;
        }

        return {
            total_storages: storages.length,
            shared_storages: storages.filter((storage) => storage.shared).length,
            local_storages: storages.filter((storage) => !storage.shared).length,
            warning_storages: storages.filter((storage) => storage.state === "warning").length,
            critical_storages: storages.filter((storage) => storage.state === "critical").length,
            storage_used_tb: +(usedGb / 1024).toFixed(2),
            storage_total_tb: +(totalGb / 1024).toFixed(2),
            storage_percent: totalGb > 0 ? Math.round((usedGb / totalGb) * 100) : 0
        };
    }

    private getNodeName(node: PVE_NodeStatus): string {
        return node.node || node.id?.replace(/^node\//, "") || "";
    }
}

export const pveStorageDetailsService = new PVEStorageDetailsService();
