import { pve_api } from "../../enum/PVE_API";
import { NodeStatus, PVE_NodeStatus } from "../../interfaces/ApiEndPoints";
import { PVEResp } from "../../interfaces/Response/PVEResp";
import { logger } from "../../middlewares/log";
import { createResponse, resp } from "../../utils/resp";
import { PVEClient, pveClient } from "./PVEClient";
import { buildPVEDatacenterNodeStatus } from "./PVEDatacenterStatusPolicy";

type PVEDatacenterStatusServiceDeps = {
    pve?: Pick<PVEClient, "request">;
};

type StorageTotals = {
    total: number;
    used: number;
};

const SHARED_STORAGE_TYPES = ["nfs", "cifs", "glusterfs", "cephfs", "rbd", "iscsi", "iscsidirect"];
const EXTRA_LOCAL_STORAGE_TYPES = ["zfspool", "lvmthin"];

export class PVEDatacenterStatusService {
    private readonly pve: Pick<PVEClient, "request">;

    constructor(deps: PVEDatacenterStatusServiceDeps = {}) {
        this.pve = deps.pve ?? pveClient;
    }

    public async getDatacenterStatus(): Promise<resp<any>> {
        try {
            const nodesResp: PVEResp = await this.pve.request("GET", pve_api.nodes);
            if (!nodesResp || !nodesResp.data) {
                return createResponse(404, "Nodes not found");
            }

            const nodes = nodesResp.data as PVE_NodeStatus[];
            const aggregate = await this.aggregateNodes(nodes);
            const storageTotal = aggregate.datacenterMaxDisk + aggregate.sharedTotal + aggregate.extraLocalTotal;
            const storageUsed = aggregate.datacenterDisk + aggregate.sharedUsed + aggregate.extraLocalUsed;

            return createResponse(200, "Datacenter status fetched successfully", {
                overview: {
                    total_nodes: nodes.length,
                    online_nodes: aggregate.online,
                    offline_nodes: aggregate.offline
                },
                datacenter: {
                    cpu_total: aggregate.datacenterMaxCpu,
                    cpu_percent: aggregate.datacenterMaxCpu > 0 ? Math.round((aggregate.datacenterCpu / aggregate.datacenterMaxCpu) * 100) : 0,
                    memory_total_gb: Math.round(aggregate.datacenterMaxMem / 1024 / 1024 / 1024),
                    memory_used_gb: Math.round(aggregate.datacenterMem / 1024 / 1024 / 1024),
                    memory_percent: aggregate.datacenterMaxMem > 0 ? Math.round((aggregate.datacenterMem / aggregate.datacenterMaxMem) * 100) : 0,
                    storage_used_tb: +(storageUsed / Math.pow(1024, 4)).toFixed(2),
                    storage_total_tb: +(storageTotal / Math.pow(1024, 4)).toFixed(2),
                    storage_percent: storageTotal > 0 ? Math.round((storageUsed / storageTotal) * 100) : 0
                },
                nodes: aggregate.nodeList
            });
        } catch (error) {
            logger.error("Error in PVEDatacenterStatusService.getDatacenterStatus:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    private async aggregateNodes(nodes: PVE_NodeStatus[]): Promise<{
        online: number;
        offline: number;
        datacenterCpu: number;
        datacenterMaxCpu: number;
        datacenterMem: number;
        datacenterMaxMem: number;
        datacenterDisk: number;
        datacenterMaxDisk: number;
        sharedTotal: number;
        sharedUsed: number;
        extraLocalTotal: number;
        extraLocalUsed: number;
        nodeList: NodeStatus[];
    }> {
        let online = 0;
        let offline = 0;
        let datacenterCpu = 0;
        let datacenterMaxCpu = 0;
        let datacenterMem = 0;
        let datacenterMaxMem = 0;
        let datacenterDisk = 0;
        let datacenterMaxDisk = 0;
        let extraLocalTotal = 0;
        let extraLocalUsed = 0;
        const nodeList: NodeStatus[] = [];
        const sharedStorageMap = new Map<string, StorageTotals>();

        for (const node of nodes) {
            const isOnline = node.status === "online";
            if (isOnline) online++;
            else offline++;

            datacenterCpu += node.cpu * node.maxcpu;
            datacenterMaxCpu += node.maxcpu;
            datacenterMem += node.mem;
            datacenterMaxMem += node.maxmem;
            datacenterDisk += node.disk;
            datacenterMaxDisk += node.maxdisk;

            if (isOnline) {
                const storageTotals = await this.aggregateNodeStorage(node.node, sharedStorageMap);
                extraLocalTotal += storageTotals.extraLocalTotal;
                extraLocalUsed += storageTotals.extraLocalUsed;
            }

            nodeList.push(buildPVEDatacenterNodeStatus(node));
        }

        let sharedTotal = 0;
        let sharedUsed = 0;
        for (const value of sharedStorageMap.values()) {
            sharedTotal += value.total;
            sharedUsed += value.used;
        }

        return {
            online,
            offline,
            datacenterCpu,
            datacenterMaxCpu,
            datacenterMem,
            datacenterMaxMem,
            datacenterDisk,
            datacenterMaxDisk,
            sharedTotal,
            sharedUsed,
            extraLocalTotal,
            extraLocalUsed,
            nodeList
        };
    }

    private async aggregateNodeStorage(
        nodeName: string,
        sharedStorageMap: Map<string, StorageTotals>
    ): Promise<{ extraLocalTotal: number; extraLocalUsed: number }> {
        let extraLocalTotal = 0;
        let extraLocalUsed = 0;

        try {
            if (!pve_api.nodes_storage) {
                return { extraLocalTotal, extraLocalUsed };
            }

            const nodeStorageResp: PVEResp = await this.pve.request("GET", pve_api.nodes_storage(nodeName));
            if (!nodeStorageResp || !Array.isArray(nodeStorageResp.data)) {
                return { extraLocalTotal, extraLocalUsed };
            }

            for (const storage of nodeStorageResp.data) {
                const total = typeof storage.total === "number"
                    ? storage.total
                    : (typeof storage.maxdisk === "number" ? storage.maxdisk : 0);
                const used = typeof storage.used === "number"
                    ? storage.used
                    : (typeof storage.disk === "number" ? storage.disk : 0);

                if (!total || total <= 0) continue;

                const storageId = storage.storage || storage.name || storage.volid || storage.id;
                if (!storageId) continue;

                if (this.isSharedStorage(storage)) {
                    const previous = sharedStorageMap.get(storageId) || { total: 0, used: 0 };
                    sharedStorageMap.set(storageId, {
                        total: Math.max(previous.total, total),
                        used: Math.max(previous.used, used)
                    });
                    continue;
                }

                if (this.isExtraLocalStorage(storage, storageId)) {
                    extraLocalTotal += total;
                    extraLocalUsed += used;
                }
            }
        } catch (error) {
            logger.error(`Error fetching storage for node ${nodeName}:`, error);
        }

        return { extraLocalTotal, extraLocalUsed };
    }

    private isSharedStorage(storage: any): boolean {
        return storage.shared === 1 || (storage.type && SHARED_STORAGE_TYPES.includes(storage.type));
    }

    private isExtraLocalStorage(storage: any, storageId: string): boolean {
        return storage.shared === 0 && storageId !== "local" && storage.type && EXTRA_LOCAL_STORAGE_TYPES.includes(storage.type);
    }
}

export const pveDatacenterStatusService = new PVEDatacenterStatusService();
