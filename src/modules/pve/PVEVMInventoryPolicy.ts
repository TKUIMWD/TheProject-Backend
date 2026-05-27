import { PVE_VMInventoryResource, VMInventoryStatus } from "../../interfaces/ApiEndPoints";

const GiB = 1024 ** 3;

export function finiteNumber(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function toPercent(used: number, total: number): number {
    return total > 0 ? Math.round((used / total) * 100) : 0;
}

export function buildVMUptime(uptime: unknown): VMInventoryStatus["uptime"] {
    const uptimeSec = Math.max(0, Math.floor(finiteNumber(uptime)));
    return {
        days: Math.floor(uptimeSec / 86400),
        hours: Math.floor((uptimeSec % 86400) / 3600),
        minutes: Math.floor((uptimeSec % 3600) / 60),
        seconds: uptimeSec % 60
    };
}

export function buildPVEVMInventoryStatus(vm: PVE_VMInventoryResource): VMInventoryStatus {
    const id = vm.id || (vm.vmid ? `vm/${vm.vmid}` : "unknown");
    const vmid = finiteNumber(vm.vmid);
    const mem = finiteNumber(vm.mem);
    const maxmem = finiteNumber(vm.maxmem);
    const disk = finiteNumber(vm.disk);
    const maxdisk = finiteNumber(vm.maxdisk);

    return {
        id,
        vmid,
        name: vm.name || id,
        node: vm.node || "unknown",
        type: vm.type || id.split("/")[0] || "unknown",
        status: vm.status || "unknown",
        template: vm.template === 1 || vm.template === true,
        cpu_percent: Math.round(finiteNumber(vm.cpu) * 100),
        memory_used_gb: +(mem / GiB).toFixed(2),
        memory_total_gb: +(maxmem / GiB).toFixed(2),
        memory_percent: toPercent(mem, maxmem),
        disk_used_gb: +(disk / GiB).toFixed(2),
        disk_total_gb: +(maxdisk / GiB).toFixed(2),
        disk_percent: toPercent(disk, maxdisk),
        uptime: buildVMUptime(vm.uptime)
    };
}
