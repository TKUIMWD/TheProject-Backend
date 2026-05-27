import { describe, expect, it } from "vitest";
import { PVEStorageDetailsService } from "../src/modules/pve/PVEStorageDetailsService";

const GiB = 1024 ** 3;

const nodes = [
    { node: "pve-a", status: "online", id: "node/pve-a" },
    { status: "online", id: "node/pve-b" },
    { node: "pve-c", status: "offline", id: "node/pve-c" }
];

function makeService(options: {
    nodesResp?: any;
    storageByNode?: Record<string, any>;
    storageErrors?: string[];
    nodeError?: Error;
} = {}) {
    const calls: Array<{ method: string; url: string }> = [];
    const service = new PVEStorageDetailsService({
        pve: {
            request: async (method, url) => {
                calls.push({ method, url });
                if (options.nodeError && url.includes("/cluster/resources?type=node")) throw options.nodeError;
                if (url.includes("/cluster/resources?type=node")) {
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

describe("PVEStorageDetailsService", () => {
    it("returns per-node storage rows and de-duplicates shared storage for totals", async () => {
        const { service, calls } = makeService({
            storageByNode: {
                "pve-a": {
                    data: [
                        { storage: "nfs-labs", type: "nfs", shared: 1, total: 1000 * GiB, used: 800 * GiB },
                        { storage: "local-zfs", type: "zfspool", shared: 0, total: 100 * GiB, used: 92 * GiB }
                    ]
                },
                "pve-b": {
                    data: [
                        { storage: "nfs-labs", type: "nfs", shared: 1, total: 1200 * GiB, used: 840 * GiB },
                        { storage: "local", type: "dir", shared: 0, total: 200 * GiB, used: 40 * GiB }
                    ]
                }
            }
        });

        await expect(service.getStorageDetails()).resolves.toMatchObject({
            code: 200,
            message: "PVE storage details fetched successfully",
            body: {
                overview: {
                    total_storages: 4,
                    shared_storages: 2,
                    local_storages: 2,
                    warning_storages: 1,
                    critical_storages: 1,
                    storage_used_tb: 0.95,
                    storage_total_tb: 1.46,
                    storage_percent: 65
                },
                storages: [
                    { node: "pve-a", name: "local-zfs", usage_percent: 92, state: "critical" },
                    { node: "pve-a", name: "nfs-labs", usage_percent: 80, state: "warning" },
                    { node: "pve-b", name: "nfs-labs", usage_percent: 70, state: "normal" },
                    { node: "pve-b", name: "local", usage_percent: 20, state: "normal" }
                ],
                source: "nodes/{node}/storage"
            }
        });

        expect(calls.map((call) => call.url)).toEqual([
            expect.stringContaining("/cluster/resources?type=node"),
            expect.stringContaining("/nodes/pve-a/storage"),
            expect.stringContaining("/nodes/pve-b/storage")
        ]);
    });

    it("returns an empty storage list when node storage calls fail", async () => {
        const { service } = makeService({ storageErrors: ["pve-a", "pve-b"] });

        await expect(service.getStorageDetails()).resolves.toMatchObject({
            code: 200,
            body: {
                overview: {
                    total_storages: 0,
                    storage_percent: 0
                },
                storages: []
            }
        });
    });

    it("returns not found when PVE returns malformed node data", async () => {
        const { service } = makeService({ nodesResp: {} });

        await expect(service.getStorageDetails()).resolves.toEqual({
            code: 404,
            message: "Nodes not found",
            body: undefined
        });
    });

    it("returns internal server error when node loading throws", async () => {
        const { service } = makeService({ nodeError: new Error("PVE unavailable") });

        await expect(service.getStorageDetails()).resolves.toEqual({
            code: 500,
            message: "Internal Server Error",
            body: undefined
        });
    });
});
