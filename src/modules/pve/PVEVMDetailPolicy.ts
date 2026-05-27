import { PVEVMDetailStatus } from "../../interfaces/ApiEndPoints";
import { PVEUtils } from "../../utils/PVEUtils";

type NetworkIPAddress = {
    "ip-address"?: string;
    "ip-address-type"?: string;
};

type NetworkInterface = {
    name?: string;
    "hardware-address"?: string;
    "ip-addresses"?: NetworkIPAddress[];
};

export function validatePVEVMDetailQuery(input: { node?: unknown; vmid?: unknown }): {
    valid: boolean;
    node?: string;
    vmid?: string;
    message?: string;
} {
    const node = typeof input.node === "string" ? input.node.trim() : "";
    const vmid = typeof input.vmid === "string" || typeof input.vmid === "number"
        ? String(input.vmid).trim()
        : "";

    if (!node) return { valid: false, message: "node is required" };
    if (!/^[A-Za-z0-9_.-]+$/.test(node)) return { valid: false, message: "node is invalid" };
    if (!vmid) return { valid: false, message: "vmid is required" };
    if (!/^\d+$/.test(vmid)) return { valid: false, message: "vmid is invalid" };

    return { valid: true, node, vmid };
}

export function buildPVEVMDetailStatus(input: {
    node: string;
    vmid: string;
    config: any;
    status?: any;
    networkInterfaces?: unknown;
    networkError?: string;
}): PVEVMDetailStatus {
    const memoryTotal = finiteNumber(input.status?.maxmem || input.config?.memory * 1024 * 1024);
    const memoryUsed = finiteNumber(input.status?.mem);
    const cpuPercent = Math.round(finiteNumber(input.status?.cpu) * 100);

    return {
        vmid: Number(input.vmid),
        name: input.config?.name || `vm-${input.vmid}`,
        node: input.node,
        type: "qemu",
        template: input.config?.template === 1 || input.config?.template === true,
        status: input.status?.status || input.config?.status || "unknown",
        uptime_seconds: finiteNumber(input.status?.uptime),
        cpu_percent: cpuPercent,
        memory_used_gb: +(memoryUsed / 1024 ** 3).toFixed(2),
        memory_total_gb: +(memoryTotal / 1024 ** 3).toFixed(2),
        memory_percent: memoryTotal > 0 ? Math.round((memoryUsed / memoryTotal) * 100) : 0,
        disk_gb: PVEUtils.extractDiskSize(input.config || {}),
        config: {
            cores: finiteNumber(input.config?.cores),
            memory_mb: finiteNumber(input.config?.memory),
            bootdisk: input.config?.bootdisk,
            ostype: input.config?.ostype,
            net0: input.config?.net0
        },
        network: {
            interfaces: simplifyPVEVMNetworkInterfaces(input.networkInterfaces),
            error: input.networkError
        }
    };
}

export function simplifyPVEVMNetworkInterfaces(interfacesData: unknown): PVEVMDetailStatus["network"]["interfaces"] {
    const interfaces = normalizeNetworkInterfaces(interfacesData);
    if (!interfaces) return [];

    return interfaces.map((iface) => {
        const ipAddresses = (iface["ip-addresses"] || [])
            .filter((ip) => ip["ip-address-type"] === "ipv4")
            .map((ip) => ip["ip-address"] || "")
            .filter((ip) => ip && !ip.startsWith("127."));

        return {
            name: iface.name || "unknown",
            macAddress: iface["hardware-address"] || "unknown",
            ipAddresses
        };
    }).filter((iface) => iface.name !== "lo" && iface.name !== "unknown" && iface.macAddress !== "unknown");
}

function normalizeNetworkInterfaces(value: unknown): NetworkInterface[] | null {
    if (Array.isArray(value)) return value as NetworkInterface[];
    if (value && typeof value === "object" && "result" in value && Array.isArray((value as { result?: unknown }).result)) {
        return (value as { result: NetworkInterface[] }).result;
    }
    return null;
}

function finiteNumber(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
