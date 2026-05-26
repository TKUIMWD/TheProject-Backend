import { NodeStatus, PVE_NodeStatus } from "../../interfaces/ApiEndPoints";

export function buildPVEDatacenterNodeStatus(node: PVE_NodeStatus): NodeStatus {
    const uptimeSec = node.uptime || 0;
    return {
        name: node.node,
        online: node.status === "online",
        address: node.id,
        cpu_percent: node.maxcpu > 0 ? Math.round(node.cpu * 100) : 0,
        memory_percent: node.maxmem > 0 ? Math.round((node.mem / node.maxmem) * 100) : 0,
        uptime: {
            days: Math.floor(uptimeSec / 86400),
            hours: Math.floor((uptimeSec % 86400) / 3600),
            minutes: Math.floor((uptimeSec % 3600) / 60),
            seconds: uptimeSec % 60
        }
    };
}
