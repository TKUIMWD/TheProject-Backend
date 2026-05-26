import { describe, expect, it } from "vitest";
import { VMDeletionAccessService } from "../src/modules/vm/VMDeletionAccessService";

const vmId = "507f1f77bcf86cd799439011";

function makeUser(ownedVMs: string[] = [vmId]) {
    return {
        _id: { toString: () => "user-1" },
        owned_vms: ownedVMs
    } as any;
}

function makeService(options: {
    vm?: any | null;
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const vm = {
        owner: "user-1",
        pve_node: "pve-a",
        pve_vmid: "101"
    };
    const service = new VMDeletionAccessService({
        vmRepository: {
            findById: async (id: string) => {
                calls.push({ method: "findById", args: [id] });
                return options.vm === undefined ? vm : options.vm;
            }
        },
        deletionWorkflow: {
            deleteUserVM: async (input) => {
                calls.push({ method: "deleteUserVM", args: [input] });
                return {
                    code: 200,
                    message: "VM deletion completed successfully",
                    body: {
                        vm_id: input.vmId,
                        pve_vmid: input.vm.pve_vmid,
                        pve_node: input.vm.pve_node,
                        message: "VM deleted successfully"
                    }
                };
            }
        }
    });

    return { calls, service };
}

describe("VMDeletionAccessService", () => {
    it("validates ownership, loads the VM, and delegates to the deletion workflow", async () => {
        const { service, calls } = makeService();

        await expect(service.deleteUserVM({
            user: makeUser(),
            tokenRole: "user",
            vmId
        })).resolves.toMatchObject({
            code: 200,
            body: {
                vm_id: vmId,
                pve_vmid: "101",
                pve_node: "pve-a"
            }
        });

        expect(calls.map(call => call.method)).toEqual(["findById", "deleteUserVM"]);
    });

    it("allows superadmins to delete VMs outside their owned list", async () => {
        const { service } = makeService();

        await expect(service.deleteUserVM({
            user: makeUser([]),
            tokenRole: "superadmin",
            vmId
        })).resolves.toMatchObject({
            code: 200
        });
    });

    it("rejects non-owned VM deletion before loading the VM", async () => {
        const { service, calls } = makeService();

        await expect(service.deleteUserVM({
            user: makeUser([]),
            tokenRole: "user",
            vmId
        })).resolves.toMatchObject({
            code: 403,
            message: "Access denied: VM not owned by user"
        });
        expect(calls).toEqual([]);
    });

    it("returns not found when the VM record does not exist", async () => {
        const { service } = makeService({ vm: null });

        await expect(service.deleteUserVM({
            user: makeUser(),
            tokenRole: "user",
            vmId
        })).resolves.toMatchObject({
            code: 404,
            message: "VM not found"
        });
    });
});
