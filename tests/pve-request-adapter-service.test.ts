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

    it("delegates latest, cleanup, and datacenter calls without request-shaped data", async () => {
        const { service, calls } = makeService();

        await service.getUserLatestTaskStatus({ user });
        await service.cleanupTasks();
        await service.getDatacenterStatus();

        expect(calls.map(call => call.method)).toEqual([
            "tasks.getUserLatestTaskStatus",
            "tasks.cleanupTasks",
            "datacenter.getDatacenterStatus"
        ]);
    });
});
