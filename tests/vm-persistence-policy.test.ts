import { describe, expect, it } from "vitest";
import {
    buildAttachOwnedVMUpdate,
    buildBoxVMMetadataUpdate,
    buildDetachOwnedVMUpdate,
    buildVMRecordCreatePayload
} from "../src/modules/vm/VMPersistencePolicy";

describe("VMPersistencePolicy", () => {
    it("builds VM record creation payloads with template lineage", () => {
        expect(buildVMRecordCreatePayload({
            pveVmid: "120",
            pveNode: "pve-a",
            ownerId: "user-1",
            fromTemplateId: "template-1"
        })).toEqual({
            pve_vmid: "120",
            pve_node: "pve-a",
            owner: "user-1",
            fromTemplateId: "template-1"
        });
    });

    it("keeps fromTemplateId optional for legacy/manual VM registration paths", () => {
        expect(buildVMRecordCreatePayload({
            pveVmid: "121",
            pveNode: "pve-b",
            ownerId: "user-2"
        })).toEqual({
            pve_vmid: "121",
            pve_node: "pve-b",
            owner: "user-2",
            fromTemplateId: undefined
        });
    });

    it("builds user owned VM attach and detach updates", () => {
        const vmId = { toString: () => "vm-1" };

        expect(buildAttachOwnedVMUpdate(vmId)).toEqual({
            $push: {
                owned_vms: vmId
            }
        });

        expect(buildDetachOwnedVMUpdate("vm-1")).toEqual({
            $pull: {
                owned_vms: "vm-1"
            }
        });
    });

    it("builds box VM metadata updates", () => {
        expect(buildBoxVMMetadataUpdate("box-1")).toEqual({
            box_id: "box-1",
            is_box_vm: true
        });
    });
});
