import { describe, expect, it } from "vitest";
import { PVEVMBatchDeleteService } from "../src/modules/pve/PVEVMBatchDeleteService";

function makeService(options: {
    statusByVmid?: Record<string, string>;
    templateByVmid?: Record<string, unknown>;
    throwOnDeleteVmid?: string;
} = {}) {
    const calls: Array<{ method: string; url: string; body: unknown; options: unknown }> = [];
    const service = new PVEVMBatchDeleteService({
        pve: {
            request: async (method, url, body, requestOptions) => {
                calls.push({ method, url, body, options: requestOptions });
                const vmid = url.match(/\/qemu\/(\d+)/)?.[1] || "0";
                if (url.includes("/status/current")) {
                    return { data: { status: options.statusByVmid?.[vmid] ?? "stopped" } };
                }
                if (url.includes("/config")) {
                    return { data: { template: options.templateByVmid?.[vmid] ?? 0 } };
                }
                if (options.throwOnDeleteVmid === vmid) throw new Error("PVE rejected delete");
                return { data: `UPID:delete:${vmid}` };
            }
        }
    });

    return { calls, service };
}

describe("PVEVMBatchDeleteService", () => {
    it("submits delete tasks only for stopped non-template QEMU VMs", async () => {
        const { service, calls } = makeService({
            statusByVmid: { "101": "stopped", "102": "running", "103": "stopped" },
            templateByVmid: { "103": 1 }
        });

        await expect(service.deleteVMs({
            targets: [
                { node: "gapvea", vmid: 101, name: "lab-a" },
                { node: "gapvea", vmid: 102, name: "running-a" },
                { node: "gapveb", vmid: 103, name: "template-a" }
            ]
        })).resolves.toEqual({
            code: 207,
            message: "Batch delete completed with failures",
            body: {
                deleted: 1,
                failed: 2,
                results: [
                    {
                        node: "gapvea",
                        vmid: 101,
                        name: "lab-a",
                        ok: true,
                        detail: "Delete task submitted",
                        upid: "UPID:delete:101",
                        status_before: "stopped"
                    },
                    {
                        node: "gapvea",
                        vmid: 102,
                        name: "running-a",
                        ok: false,
                        detail: "VM must be stopped before deletion",
                        status_before: "running"
                    },
                    {
                        node: "gapveb",
                        vmid: 103,
                        name: "template-a",
                        ok: false,
                        detail: "Template VMs cannot be deleted from this panel",
                        status_before: "stopped"
                    }
                ]
            }
        });

        expect(calls.filter((call) => call.method === "DELETE")).toHaveLength(1);
        expect(calls.find((call) => call.method === "DELETE")).toMatchObject({
            url: expect.stringContaining("/nodes/gapvea/qemu/101"),
            options: { mode: "admin" }
        });
    });

    it("rejects invalid input before calling PVE", async () => {
        const { service, calls } = makeService();

        await expect(service.deleteVMs({ targets: [{ node: "gapvea", vmid: "bad" }] })).resolves.toEqual({
            code: 400,
            message: "target 1 vmid is invalid",
            body: undefined
        });
        expect(calls).toEqual([]);
    });

    it("records per-VM failures when PVE delete submission fails", async () => {
        const { service } = makeService({ throwOnDeleteVmid: "101" });

        await expect(service.deleteVMs({
            targets: [{ node: "gapvea", vmid: 101, name: "lab-a" }]
        })).resolves.toEqual({
            code: 207,
            message: "Batch delete completed with failures",
            body: {
                deleted: 0,
                failed: 1,
                results: [{
                    node: "gapvea",
                    vmid: 101,
                    name: "lab-a",
                    ok: false,
                    detail: "PVE rejected delete",
                    status_before: undefined
                }]
            }
        });
    });
});
