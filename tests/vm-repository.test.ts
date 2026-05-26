import { describe, expect, it } from "vitest";
import { VMRepository } from "../src/modules/vm/VMRepository";

function makeRepository() {
    const calls: Array<{ target: string; method: string; args: unknown[] }> = [];
    const vmRecord = { _id: { toString: () => "vm-1" } };

    const vmModel = {
        create: async (payload: unknown) => {
            calls.push({ target: "vm", method: "create", args: [payload] });
            return vmRecord;
        },
        findById: (id: unknown) => {
            calls.push({ target: "vm", method: "findById", args: [id] });
            return {
                exec: async () => vmRecord
            };
        },
        findOne: (query: unknown) => {
            calls.push({ target: "vm", method: "findOne", args: [query] });
            return {
                exec: async () => vmRecord
            };
        },
        deleteOne: async (query: unknown) => {
            calls.push({ target: "vm", method: "deleteOne", args: [query] });
            return { acknowledged: true, deletedCount: 1 } as any;
        },
        updateOne: async (query: unknown, update: unknown) => {
            calls.push({ target: "vm", method: "updateOne", args: [query, update] });
            return { acknowledged: true, matchedCount: 1, modifiedCount: 1 } as any;
        }
    };

    const usersModel = {
        updateOne: async (query: unknown, update: unknown) => {
            calls.push({ target: "users", method: "updateOne", args: [query, update] });
            return { acknowledged: true, matchedCount: 1, modifiedCount: 1 } as any;
        }
    };

    return {
        calls,
        repository: new VMRepository(vmModel as any, usersModel as any)
    };
}

describe("VMRepository", () => {
    it("creates a VM record and attaches it to the user's owned VM list", async () => {
        const { repository, calls } = makeRepository();

        await expect(repository.createUserOwnedVM({
            userId: "user-1",
            pveVmid: "120",
            pveNode: "pve-a",
            fromTemplateId: "template-1"
        })).resolves.toBe("vm-1");

        expect(calls).toEqual([
            {
                target: "vm",
                method: "create",
                args: [{
                    pve_vmid: "120",
                    pve_node: "pve-a",
                    owner: "user-1",
                    fromTemplateId: "template-1"
                }]
            },
            {
                target: "users",
                method: "updateOne",
                args: [
                    { _id: "user-1" },
                    { $push: { owned_vms: { toString: expect.any(Function) } } }
                ]
            }
        ]);
    });

    it("marks VM records as box VMs", async () => {
        const { repository, calls } = makeRepository();

        await repository.markAsBoxVM("vm-1", "box-1");

        expect(calls).toEqual([
            {
                target: "vm",
                method: "updateOne",
                args: [
                    { _id: "vm-1" },
                    { box_id: "box-1", is_box_vm: true }
                ]
            }
        ]);
    });

    it("finds VM records by PVE identity", async () => {
        const { repository, calls } = makeRepository();

        await expect(repository.findByPVE("120", "pve-a")).resolves.toEqual({
            _id: { toString: expect.any(Function) }
        });

        expect(calls).toEqual([
            {
                target: "vm",
                method: "findOne",
                args: [{ pve_vmid: "120", pve_node: "pve-a" }]
            }
        ]);
    });

    it("finds VM records by owner and PVE identity", async () => {
        const { repository, calls } = makeRepository();

        await expect(repository.findByOwnerAndPVE("user-1", "pve-a", "120")).resolves.toEqual({
            _id: { toString: expect.any(Function) }
        });

        expect(calls).toEqual([
            {
                target: "vm",
                method: "findOne",
                args: [{ owner: "user-1", pve_node: "pve-a", pve_vmid: "120" }]
            }
        ]);
    });

    it("finds VM records by Mongo ID", async () => {
        const { repository, calls } = makeRepository();

        await expect(repository.findById("vm-1")).resolves.toEqual({
            _id: { toString: expect.any(Function) }
        });

        expect(calls).toEqual([
            {
                target: "vm",
                method: "findById",
                args: ["vm-1"]
            }
        ]);
    });

    it("deletes VM records and detaches owned VM IDs", async () => {
        const { repository, calls } = makeRepository();

        await repository.deleteVMRecord("vm-1");
        await repository.detachOwnedVM("user-1", "vm-1");

        expect(calls).toEqual([
            {
                target: "vm",
                method: "deleteOne",
                args: [{ _id: "vm-1" }]
            },
            {
                target: "users",
                method: "updateOne",
                args: [
                    { _id: "user-1" },
                    { $pull: { owned_vms: "vm-1" } }
                ]
            }
        ]);
    });
});
