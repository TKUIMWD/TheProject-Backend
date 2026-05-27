import { NodeStatus, PVE_NodeStatus } from "../../interfaces/ApiEndPoints";

function finiteNumber(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function buildPVEDatacenterNodeStatus(node: PVE_NodeStatus): NodeStatus {
    const uptimeSec = Math.max(0, Math.floor(finiteNumber(node.uptime)));
    const name = node.node || node.id?.replace(/^node\//, "") || "unknown";
    const cpu = finiteNumber(node.cpu);
    const maxcpu = finiteNumber(node.maxcpu);
    const mem = finiteNumber(node.mem);
    const maxmem = finiteNumber(node.maxmem);

    return {
        name,
        online: node.status === "online",
        address: node.id || name,
        cpu_percent: maxcpu > 0 ? Math.round(cpu * 100) : 0,
        memory_percent: maxmem > 0 ? Math.round((mem / maxmem) * 100) : 0,
        uptime: {
            days: Math.floor(uptimeSec / 86400),
            hours: Math.floor((uptimeSec % 86400) / 3600),
            minutes: Math.floor((uptimeSec % 3600) / 60),
            seconds: uptimeSec % 60
        }
    };
}
