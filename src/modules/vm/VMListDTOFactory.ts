import { VMBasicConfig, VMDetailWithBasicConfig } from "../../interfaces/VM/VM";

type VMListSource = {
    _id?: any;
    pve_vmid: string;
    pve_node: string;
    owner?: unknown;
};

type VMOwnerSource = {
    _id?: unknown;
    username?: unknown;
};

type VMStatusSource = {
    status: string;
    uptime?: number;
};

export function collectVMOwnerIds(vms: VMListSource[]): string[] {
    return Array.from(new Set(
        vms
            .map((vm) => vm.owner)
            .filter((id) => id !== undefined && id !== null)
            .map((id) => String(id))
            .filter((id) => id !== "")
    ));
}

export function buildVMOwnerNameMap(users: VMOwnerSource[]): Map<string, string> {
    const map = new Map<string, string>();
    users.forEach((user) => {
        if (user._id === undefined || typeof user.username !== "string") {
            return;
        }
        map.set(String(user._id), user.username);
    });
    return map;
}

export function getVMOwnerName(ownerNameById: Map<string, string>, ownerId: unknown, fallback = "Unknown"): string {
    if (ownerId === undefined || ownerId === null) {
        return fallback;
    }
    return ownerNameById.get(String(ownerId)) || fallback;
}

export function buildVMListItemDTO(
    vm: VMListSource,
    input: {
        basicConfig?: VMBasicConfig;
        basicConfigError?: string | null;
        vmStatus?: VMStatusSource | null;
        ownerName?: string;
        includePveName?: boolean;
    }
): VMDetailWithBasicConfig {
    const detail: VMDetailWithBasicConfig = {
        _id: vm._id,
        pve_vmid: vm.pve_vmid,
        pve_node: vm.pve_node,
        status: input.vmStatus ? {
            current_status: input.vmStatus.status,
            uptime: input.vmStatus.uptime
        } : null,
        error: input.basicConfigError || null
    };

    if (input.includePveName) {
        detail.pve_name = input.basicConfig?.name || "Unknown";
    }

    if (input.ownerName !== undefined) {
        detail.owner = input.ownerName;
    }

    return detail;
}

export function buildVMListErrorDTO(
    vm: VMListSource,
    error: string,
    owner?: unknown
): VMDetailWithBasicConfig {
    return {
        _id: vm._id,
        pve_vmid: vm.pve_vmid,
        pve_node: vm.pve_node,
        owner: owner === undefined || owner === null ? undefined : String(owner),
        config: null,
        status: null,
        error
    };
}
