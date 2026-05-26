import { describe, expect, it } from "vitest";
import { VMDeletionWorkflowService } from "../src/modules/vm/VMDeletionWorkflowService";

const vm = {
    owner: "owner-1",
    pve_node: "pve-node",
    pve_vmid: "101"
};

function makeService(options: {
    vmStatus?: { status?: string } | null;
    vmConfig?: any;
    pveDeleteResponse?: any;
    pveDeleteError?: unknown;
    waitResult?: { success: boolean; errorMessage?: string };
} = {}) {
    const calls: Array<{ target: string; method: string; args: unknown[] }> = [];

    const vmRepository = {
        deleteVMRecord: async (vmId: string) => {
            calls.push({ target: "repo", method: "deleteVMRecord", args: [vmId] });
            return { acknowledged: true, deletedCount: 1 } as any;
        },
        detachOwnedVM: async (userId: string, vmId: unknown) => {
            calls.push({ target: "repo", method: "detachOwnedVM", args: [userId, vmId] });
            return { acknowledged: true, matchedCount: 1, modifiedCount: 1 } as any;
        }
    };

    const pveClient = {
        request: async (method: string, url: string) => {
            calls.push({ target: "pve", method: "request", args: [method, url] });
            if (options.pveDeleteError) throw options.pveDeleteError;
            return Object.prototype.hasOwnProperty.call(options, "pveDeleteResponse")
                ? options.pveDeleteResponse
                : { data: null };
        }
    };

    const vmUtils = {
        getVMStatus: async (node: string, vmid: string) => {
            calls.push({ target: "vmUtils", method: "getVMStatus", args: [node, vmid] });
            return Object.prototype.hasOwnProperty.call(options, "vmStatus")
                ? options.vmStatus
                : { status: "stopped" };
        },
        getCurrentVMConfig: async (node: string, vmid: string) => {
            calls.push({ target: "vmUtils", method: "getCurrentVMConfig", args: [node, vmid] });
            return Object.prototype.hasOwnProperty.call(options, "vmConfig")
                ? options.vmConfig
                : { cores: 2, memory: "4096", scsi0: "local-lvm:vm-101-disk-0.qcow2,size=40G" };
        },
        waitForTaskCompletion: async (node: string, upid: string, operationType?: string) => {
            calls.push({ target: "vmUtils", method: "waitForTaskCompletion", args: [node, upid, operationType] });
            return options.waitResult ?? { success: true };
        }
    };

    const resourceAccounting = {
        reclaimWithConfig: async (userId: string, config: unknown) => {
            calls.push({ target: "resources", method: "reclaimWithConfig", args: [userId, config] });
        }
    };

    return {
        calls,
        service: new VMDeletionWorkflowService({
            vmRepository,
            pveClient,
            vmUtils,
            resourceAccounting
        })
    };
}

describe("VMDeletionWorkflowService", () => {
    it("deletes a stopped VM immediately, reclaims resources, and cleans database records", async () => {
        const { service, calls } = makeService();

        await expect(service.deleteUserVM({ vmId: "vm-1", vm })).resolves.toMatchObject({
            code: 200,
            body: {
                vm_id: "vm-1",
                pve_vmid: "101",
                pve_node: "pve-node",
                message: "VM deleted successfully"
            }
        });

        expect(calls.map(call => `${call.target}.${call.method}`)).toEqual([
            "vmUtils.getVMStatus",
            "vmUtils.getCurrentVMConfig",
            "pve.request",
            "resources.reclaimWithConfig",
            "repo.deleteVMRecord",
            "repo.detachOwnedVM"
        ]);
    });

    it("waits for PVE task completion when delete returns a task id", async () => {
        const { service, calls } = makeService({
            pveDeleteResponse: { data: "UPID:pve-node:delete" }
        });

        await expect(service.deleteUserVM({ vmId: "vm-1", vm })).resolves.toMatchObject({
            code: 200,
            body: {
                task_id: "UPID:pve-node:delete",
                message: "VM deletion task completed successfully"
            }
        });

        expect(calls).toContainEqual({
            target: "vmUtils",
            method: "waitForTaskCompletion",
            args: ["pve-node", "UPID:pve-node:delete", "VM deletion"]
        });
    });

    it("rejects deletion when the VM is running before calling PVE", async () => {
        const { service, calls } = makeService({
            vmStatus: { status: "running" }
        });

        await expect(service.deleteUserVM({ vmId: "vm-1", vm })).resolves.toMatchObject({
            code: 400,
            message: "VM is currently running. Please stop the VM before deletion."
        });

        expect(calls).toEqual([
            { target: "vmUtils", method: "getVMStatus", args: ["pve-node", "101"] }
        ]);
    });

    it("returns a user-safe PVE API failure message", async () => {
        const { service } = makeService({
            pveDeleteError: new Error("connection refused")
        });

        await expect(service.deleteUserVM({ vmId: "vm-1", vm })).resolves.toMatchObject({
            code: 500,
            message: "PVE API call failed: connection refused"
        });
    });
});
