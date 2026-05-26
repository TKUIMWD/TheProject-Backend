import { describe, expect, it } from "vitest";
import { PVEDatacenterStatusService } from "../src/modules/pve/PVEDatacenterStatusService";

const TiB = 1024 ** 4;
const GiB = 1024 ** 3;

const nodes = [
    {
        node: "pve-a",
        status: "online",
        id: "node/pve-a",
        cpu: 0.5,
        maxcpu: 8,
        mem: 8 * GiB,
        maxmem: 16 * GiB,
        disk: 0.2 * TiB,
        maxdisk: 1 * TiB,
        uptime: 3600
    },
    {
        node: "pve-b",
        status: "online",
        id: "node/pve-b",
        cpu: 0.25,
        maxcpu: 4,
        mem: 4 * GiB,
        maxmem: 8 * GiB,
        disk: 0.3 * TiB,
        maxdisk: 1 * TiB,
        uptime: 90
    },
    {
        node: "pve-c",
        status: "offline",
        id: "node/pve-c",
        cpu: 0,
        maxcpu: 2,
        mem: 1 * GiB,
        maxmem: 2 * GiB,
        disk: 0.1 * TiB,
        maxdisk: 1 * TiB,
        uptime: 0
    }
];

function makeService(options: {
    nodesResp?: any;
    storageByNode?: Record<string, any>;
    storageErrors?: string[];
    nodeError?: Error;
} = {}) {
    const calls: Array<{ method: string; url: string }> = [];
    const service = new PVEDatacenterStatusService({
        pve: {
            request: async (method, url) => {
                calls.push({ method, url });
                if (options.nodeError && url.endsWith("/nodes")) throw options.nodeError;
                if (url.endsWith("/nodes")) {
                    return options.nodesResp ?? { data: nodes };
                }

                const node = url.match(/\/nodes\/([^/]+)\/storage/)?.[1];
                if (node && options.storageErrors?.includes(node)) {
                    throw new Error(`storage failed: ${node}`);
                }

                return options.storageByNode?.[node || ""] ?? { data: [] };
            }
        }
    });

    return { calls, service };
}

describe("PVEDatacenterStatusService", () => {
    it("aggregates node, shared storage, and extra local storage usage", async () => {
        const { service, calls } = makeService({
            storageByNode: {
                "pve-a": {
                    data: [
                        { storage: "nfs-labs", type: "nfs", shared: 1, total: 2 * TiB, used: 1 * TiB },
                        { storage: "fast-zfs", type: "zfspool", shared: 0, total: 1 * TiB, used: 0.5 * TiB },
                        { storage: "local", type: "dir", shared: 0, total: 10 * TiB, used: 9 * TiB }
                    ]
                },
                "pve-b": {
                    data: [
                        { storage: "nfs-labs", type: "nfs", shared: 1, total: 3 * TiB, used: 1.2 * TiB },
                        { storage: "thin-a", type: "lvmthin", shared: 0, maxdisk: 0.5 * TiB, disk: 0.1 * TiB }
                    ]
                }
            }
        });

        await expect(service.getDatacenterStatus()).resolves.toMatchObject({
            code: 200,
            message: "Datacenter status fetched successfully",
            body: {
                overview: {
                    total_nodes: 3,
                    online_nodes: 2,
                    offline_nodes: 1
                },
                datacenter: {
                    cpu_total: 14,
                    cpu_percent: 36,
                    memory_total_gb: 26,
                    memory_used_gb: 13,
                    memory_percent: 50,
                    storage_used_tb: 2.4,
                    storage_total_tb: 7.5,
                    storage_percent: 32
                },
                nodes: [
                    { name: "pve-a", online: true, cpu_percent: 50, memory_percent: 50 },
                    { name: "pve-b", online: true, cpu_percent: 25, memory_percent: 50 },
                    { name: "pve-c", online: false, cpu_percent: 0, memory_percent: 50 }
                ]
            }
        });

        expect(calls.map((call) => call.url)).toEqual([
            expect.stringMatching(/\/nodes$/),
            expect.stringContaining("/nodes/pve-a/storage"),
            expect.stringContaining("/nodes/pve-b/storage")
        ]);
    });

    it("returns not found when PVE returns no node data", async () => {
        const { service } = makeService({ nodesResp: {} });

        await expect(service.getDatacenterStatus()).resolves.toEqual({
            code: 404,
            message: "Nodes not found",
            body: undefined
        });
    });

    it("ignores per-node storage failures and still returns node overview", async () => {
        const { service } = makeService({ storageErrors: ["pve-a", "pve-b"] });

        await expect(service.getDatacenterStatus()).resolves.toMatchObject({
            code: 200,
            body: {
                overview: {
                    online_nodes: 2,
                    offline_nodes: 1
                },
                datacenter: {
                    storage_used_tb: 0.6,
                    storage_total_tb: 3,
                    storage_percent: 20
                }
            }
        });
    });

    it("returns internal server error when node loading throws", async () => {
        const { service } = makeService({ nodeError: new Error("PVE unavailable") });

        await expect(service.getDatacenterStatus()).resolves.toEqual({
            code: 500,
            message: "Internal Server Error",
            body: undefined
        });
    });
});
