export type VMRecordCreatePayload = {
    pve_vmid: string;
    pve_node: string;
    owner: string;
    fromTemplateId?: string;
};

export function buildVMRecordCreatePayload(input: {
    pveVmid: string;
    pveNode: string;
    ownerId: string;
    fromTemplateId?: string;
}): VMRecordCreatePayload {
    return {
        pve_vmid: input.pveVmid,
        pve_node: input.pveNode,
        owner: input.ownerId,
        fromTemplateId: input.fromTemplateId
    };
}

export function buildAttachOwnedVMUpdate(vmId: unknown): { $push: { owned_vms: unknown } } {
    return {
        $push: {
            owned_vms: vmId
        }
    };
}

export function buildDetachOwnedVMUpdate(vmId: unknown): { $pull: { owned_vms: unknown } } {
    return {
        $pull: {
            owned_vms: vmId
        }
    };
}

export function buildBoxVMMetadataUpdate(boxId: string): { box_id: string; is_box_vm: true } {
    return {
        box_id: boxId,
        is_box_vm: true
    };
}
