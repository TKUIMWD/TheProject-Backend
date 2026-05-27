import { describe, expect, it } from "vitest";
import { PVEVMInventoryService } from "../src/modules/pve/PVEVMInventoryService";

const GiB = 1024 ** 3;

const vms = [
    {
        id: "qemu/101",
        vmid: 101,
        name: "lab-a",
        node: "pve-b",
        type: "qemu",
        status: "running",
        cpu: 0.1,
        maxcpu: 2,
        mem: 2 * GiB,
        maxmem: 8 * GiB,
        disk: 12 * GiB,
        maxdisk: 40 * GiB,
        uptime: 3600
    },
    {
        id: "qemu/100",
        vmid: 100,
        name: "template-a",
        node: "pve-a",
        type: "qemu",
        status: "stopped",
        template: 1,
        cpu: 0,
        maxcpu: 4,
        mem: 0,
        maxmem: 16 * GiB,
        disk: 20 * GiB,
        maxdisk: 80 * GiB,
        uptime: 0
    },
    {
        id: "lxc/201",
        vmid: 201,
        name: "container-a",
        node: "pve-a",
        type: "lxc",
        status: "paused",
        cpu: 0.05,
        maxcpu: 1,
        mem: 1 * GiB,
        maxmem: 2 * GiB,
        disk: 4 * GiB,
        maxdisk: 10 * GiB,
        uptime: 90
    }
];

function makeService(options: { vmResp?: any; vmError?: Error } = {}) {
    const calls: Array<{ method: string; url: string }> = [];
    const service = new PVEVMInventoryService({
        pve: {
            request: async (method, url) => {
                calls.push({ method, url });
                if (options.vmError) throw options.vmError;
                return options.vmResp ?? { data: vms };
            }
        }
    });

    return { calls, service };
}

describe("PVEVMInventoryService", () => {
    it("fetches PVE VM inventory from cluster resources and aggregates overview", async () => {
        const { calls, service } = makeService();

        await expect(service.getVMInventory()).resolves.toMatchObject({
            code: 200,
            message: "VM inventory fetched successfully",
            body: {
                overview: {
                    total_vms: 3,
                    running_vms: 1,
                    stopped_vms: 1,
                    paused_vms: 1,
                    templates: 1,
                    qemu_vms: 2,
                    lxc_containers: 1
                },
                resources: {
                    cpu_total: 7,
                    cpu_percent: 4,
                    memory_used_gb: 3,
                    memory_total_gb: 26,
                    memory_percent: 12,
                    disk_used_gb: 36,
                    disk_total_gb: 130,
                    disk_percent: 28
                },
                vms: [
                    { vmid: 100, node: "pve-a", name: "template-a", template: true },
                    { vmid: 201, node: "pve-a", name: "container-a", type: "lxc" },
                    { vmid: 101, node: "pve-b", name: "lab-a", status: "running" }
                ],
                source: "cluster/resources?type=vm"
            }
        });

        expect(calls).toEqual([
            { method: "GET", url: expect.stringContaining("/cluster/resources?type=vm") }
        ]);
    });

    it("returns an empty inventory when PVE reports no VMs", async () => {
        const { service } = makeService({ vmResp: { data: [] } });

        await expect(service.getVMInventory()).resolves.toMatchObject({
            code: 200,
            body: {
                overview: {
                    total_vms: 0,
                    running_vms: 0,
                    stopped_vms: 0,
                    paused_vms: 0,
                    templates: 0
                },
                vms: []
            }
        });
    });

    it("returns not found when PVE response is not a resource array", async () => {
        const { service } = makeService({ vmResp: {} });

        await expect(service.getVMInventory()).resolves.toEqual({
            code: 404,
            message: "VM inventory not found",
            body: undefined
        });
    });

    it("returns internal server error when PVE VM inventory loading throws", async () => {
        const { service } = makeService({ vmError: new Error("PVE unavailable") });

        await expect(service.getVMInventory()).resolves.toEqual({
            code: 500,
            message: "Internal Server Error",
            body: undefined
        });
    });
});
