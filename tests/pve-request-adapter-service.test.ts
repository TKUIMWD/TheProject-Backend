import { describe, expect, it } from "vitest";
import { PVERequestAdapterService } from "../src/modules/pve/PVERequestAdapterService";

const user = {
    _id: { toString: () => "user-1" },
    role: "user",
    owned_vms: ["507f1f77bcf86cd799439011"]
} as any;

function makeService() {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const service = new PVERequestAdapterService({
        pve: {
            request: async (method, url, body, options) => {
                calls.push({ method: "pve.request", args: [method, url, body, options] });
                return { data: [{ node: "pve-a" }] } as any;
            }
        },
        qemuConfigAccess: {
            getQemuConfig: async (input) => {
                calls.push({ method: "qemu.getQemuConfig", args: [input] });
                return { code: 200, message: "qemu", body: { vmid: "101" } };
            }
        },
        taskService: {
            getMultipleTasksStatus: async (input) => {
                calls.push({ method: "tasks.getMultipleTasksStatus", args: [input] });
                return { code: 200, message: "multiple", body: [] };
            },
            getUserLatestTaskStatus: async (inputUser) => {
                calls.push({ method: "tasks.getUserLatestTaskStatus", args: [inputUser] });
                return { code: 200, message: "latest", body: {} };
            },
            getUserAllTasksStatus: async (input) => {
                calls.push({ method: "tasks.getUserAllTasksStatus", args: [input] });
                return { code: 200, message: "all", body: {} };
            },
            refreshTaskStatus: async (input) => {
                calls.push({ method: "tasks.refreshTaskStatus", args: [input] });
                return { code: 200, message: "refresh", body: {} };
            },
            getRecentTasks: async (input) => {
                calls.push({ method: "tasks.getRecentTasks", args: [input] });
                return { code: 200, message: "recent", body: { tasks: [] } };
            },
            cleanupTasks: async () => {
                calls.push({ method: "tasks.cleanupTasks", args: [] });
                return { code: 200, message: "cleanup", body: {} };
            }
        },
        datacenterStatus: {
            getDatacenterStatus: async () => {
                calls.push({ method: "datacenter.getDatacenterStatus", args: [] });
                return { code: 200, message: "datacenter", body: {} };
            }
        },
        vmInventory: {
            getVMInventory: async () => {
                calls.push({ method: "vmInventory.getVMInventory", args: [] });
                return { code: 200, message: "vm inventory", body: { vms: [] } };
            }
        },
        storageDetails: {
            getStorageDetails: async () => {
                calls.push({ method: "storageDetails.getStorageDetails", args: [] });
                return { code: 200, message: "storage details", body: { storages: [] } };
            }
        },
        vmDetail: {
            getVMDetail: async (input) => {
                calls.push({ method: "vmDetail.getVMDetail", args: [input] });
                return { code: 200, message: "vm detail", body: { vmid: 101 } };
            }
        },
        vmOperation: {
            operateVM: async (input) => {
                calls.push({ method: "vmOperation.operateVM", args: [input] });
                return { code: 202, message: "operation", body: { upid: "UPID:operation" } };
            }
        },
        vmBatchDelete: {
            deleteVMs: async (input) => {
                calls.push({ method: "vmBatchDelete.deleteVMs", args: [input] });
                return { code: 202, message: "delete", body: { deleted: 1, failed: 0, results: [] } };
            }
        },
        dashboardTrends: {
            getDashboardTrends: async (input) => {
                calls.push({ method: "dashboardTrends.getDashboardTrends", args: [input] });
                return { code: 200, message: "trends", body: { points: [] } };
            }
        }
    });

    return { calls, service };
}

describe("PVERequestAdapterService", () => {
    it("forwards qemu config query ids into the qemu config access service", async () => {
        const { service, calls } = makeService();

        await expect(service.getQemuConfig({
            role: "user",
            user,
            query: { id: "507f1f77bcf86cd799439011" }
        })).resolves.toMatchObject({
            code: 200,
            message: "qemu"
        });

        expect(calls).toEqual([
            {
                method: "qemu.getQemuConfig",
                args: [{
                    role: "user",
                    user,
                    vmId: "507f1f77bcf86cd799439011"
                }]
            }
        ]);
    });

    it("fetches PVE nodes through the admin-mode PVE client", async () => {
        const { service, calls } = makeService();

        await expect(service.getNodes()).resolves.toMatchObject({
            code: 200,
            message: "Nodes fetched successfully",
            body: [{ node: "pve-a" }]
        });

        expect(calls[0]).toMatchObject({
            method: "pve.request",
            args: ["GET", expect.stringContaining("/nodes"), undefined, { mode: "admin" }]
        });
    });

    it("maps request body task_ids to multiple task status input", async () => {
        const { service, calls } = makeService();

        await service.getMultipleTasksStatus({
            user,
            body: { task_ids: ["task-1", "task-2"] }
        });

        expect(calls).toEqual([
            {
                method: "tasks.getMultipleTasksStatus",
                args: [{
                    user,
                    taskIds: ["task-1", "task-2"]
                }]
            }
        ]);
    });

    it("maps request query pagination to user task status input", async () => {
        const { service, calls } = makeService();

        await service.getUserAllTasksStatus({
            user,
            query: {
                page: "2",
                limit: "10",
                status: "completed"
            }
        });

        expect(calls).toEqual([
            {
                method: "tasks.getUserAllTasksStatus",
                args: [{
                    user,
                    page: "2",
                    limit: "10",
                    status: "completed"
                }]
            }
        ]);
    });

    it("maps refresh body task_id to refresh task status input", async () => {
        const { service, calls } = makeService();

        await service.refreshTaskStatus({
            user,
            body: { task_id: "task-1" }
        });

        expect(calls).toEqual([
            {
                method: "tasks.refreshTaskStatus",
                args: [{
                    user,
                    taskId: "task-1"
                }]
            }
        ]);
    });

    it("maps recent task query filters to task service input", async () => {
        const { service, calls } = makeService();

        await service.getRecentTasks({
            query: {
                page: "1",
                limit: "5",
                status: "failed"
            }
        });

        expect(calls).toEqual([
            {
                method: "tasks.getRecentTasks",
                args: [{
                    page: "1",
                    limit: "5",
                    status: "failed"
                }]
            }
        ]);
    });

    it("maps VM detail query to VM detail service input", async () => {
        const { service, calls } = makeService();

        await service.getVMDetail({
            query: {
                node: "gapvea",
                vmid: "101"
            }
        });

        expect(calls).toEqual([
            {
                method: "vmDetail.getVMDetail",
                args: [{ node: "gapvea", vmid: "101" }]
            }
        ]);
    });

    it("maps VM operation body to VM operation service input", async () => {
        const { service, calls } = makeService();

        await service.operateVM({
            body: {
                node: "gapvea",
                vmid: "101",
                action: "start"
            }
        });

        expect(calls).toEqual([
            {
                method: "vmOperation.operateVM",
                args: [{ node: "gapvea", vmid: "101", action: "start" }]
            }
        ]);
    });

    it("maps VM batch delete body to VM batch delete service input", async () => {
        const { service, calls } = makeService();

        await service.deleteVMs({
            body: {
                targets: [{ node: "gapvea", vmid: 101, name: "lab-a" }]
            }
        });

        expect(calls).toEqual([
            {
                method: "vmBatchDelete.deleteVMs",
                args: [{ targets: [{ node: "gapvea", vmid: 101, name: "lab-a" }] }]
            }
        ]);
    });

    it("maps dashboard trend query to trend service input", async () => {
        const { service, calls } = makeService();

        await service.getDashboardTrends({
            query: { limit: "24" }
        });

        expect(calls).toEqual([
            {
                method: "dashboardTrends.getDashboardTrends",
                args: [{ limit: "24" }]
            }
        ]);
    });

    it("delegates latest, cleanup, datacenter, VM inventory, and storage calls without request-shaped data", async () => {
        const { service, calls } = makeService();

        await service.getUserLatestTaskStatus({ user });
        await service.cleanupTasks();
        await service.getDatacenterStatus();
        await service.getVMInventory();
        await service.getStorageDetails();

        expect(calls.map(call => call.method)).toEqual([
            "tasks.getUserLatestTaskStatus",
            "tasks.cleanupTasks",
            "datacenter.getDatacenterStatus",
            "vmInventory.getVMInventory",
            "storageDetails.getStorageDetails"
        ]);
    });
});
