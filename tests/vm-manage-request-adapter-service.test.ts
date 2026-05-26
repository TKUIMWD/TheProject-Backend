import { describe, expect, it } from "vitest";
import { VMManageRequestAdapterService } from "../src/modules/vm/VMManageRequestAdapterService";

const user = {
    _id: { toString: () => "user-1" },
    username: "alice",
    owned_vms: ["507f1f77bcf86cd799439011"]
} as any;

function makeService() {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const service = new VMManageRequestAdapterService({
        creationRequest: {
            createFromTemplate: async (input) => {
                calls.push({ method: "createFromTemplate", args: [input] });
                return { code: 200, message: "created", body: { vmid: "101" } };
            },
            createFromBoxTemplate: async (input) => {
                calls.push({ method: "createFromBoxTemplate", args: [input] });
                return { code: 200, message: "box created", body: { vmid: "102" } };
            }
        },
        configUpdate: {
            updateVMConfig: async (input) => {
                calls.push({ method: "updateVMConfig", args: [input] });
                return { code: 200, message: "updated", body: { task_id: "task-1" } };
            }
        },
        deletionAccess: {
            deleteUserVM: async (input) => {
                calls.push({ method: "deleteUserVM", args: [input] });
                return {
                    code: 200,
                    message: "deleted",
                    body: {
                        vm_id: String(input.vmId),
                        pve_vmid: "101",
                        pve_node: "pve-a",
                        message: "VM deleted successfully"
                    }
                };
            }
        }
    });

    return { calls, service };
}

describe("VMManageRequestAdapterService", () => {
    it("forwards template creation body to the creation request service", async () => {
        const { service, calls } = makeService();
        const body = { template_id: "template-1", name: "Lab" };

        await expect(service.createVMFromTemplate({ user, body })).resolves.toMatchObject({
            code: 200,
            message: "created"
        });

        expect(calls).toEqual([
            {
                method: "createFromTemplate",
                args: [{ user, body }]
            }
        ]);
    });

    it("forwards box template creation body to the creation request service", async () => {
        const { service, calls } = makeService();
        const body = { box_id: "box-1", name: "Box Lab" };

        await service.createVMFromBoxTemplate({ user, body });

        expect(calls).toEqual([
            {
                method: "createFromBoxTemplate",
                args: [{ user, body }]
            }
        ]);
    });

    it("forwards VM config update body to the config update workflow", async () => {
        const { service, calls } = makeService();
        const body = { vm_id: "vm-1", cpuCores: 4 };

        await service.updateVMConfig({ user, body });

        expect(calls).toEqual([
            {
                method: "updateVMConfig",
                args: [{ user, body }]
            }
        ]);
    });

    it("maps delete body vm_id to the deletion access service", async () => {
        const { service, calls } = makeService();

        await expect(service.deleteUserVM({
            user,
            tokenRole: "user",
            body: { vm_id: "507f1f77bcf86cd799439011" }
        })).resolves.toMatchObject({
            code: 200,
            body: {
                vm_id: "507f1f77bcf86cd799439011"
            }
        });

        expect(calls).toEqual([
            {
                method: "deleteUserVM",
                args: [{
                    user,
                    tokenRole: "user",
                    vmId: "507f1f77bcf86cd799439011"
                }]
            }
        ]);
    });
});
