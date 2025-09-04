export interface PVEApiEndPoints {
    test: string; // /test
    access_ticket: string;  // /access/ticket
    nodes: string; // /nodes
    nodes_qemu_config: (node: string, vmid: string) => string; // /nodes/{node}/qemu/{vmid}/config
    nodes_qemu_status: (node: string, vmid: string) => string; // /nodes/{node}/qemu/{vmid}/status/current
    nodes_qemu_cloudinit: (node: string, vmid: string) => string; // /nodes/{node}/qemu/{vmid}/cloudinit
    nodes_qemu_agent: (node: string, vmid: string) => string; // /nodes/{node}/qemu/{vmid}/agent
    nodes_qemu_agent_network: (node: string, vmid: string) => string; // /nodes/{node}/qemu/{vmid}/agent/network-get-interfaces
    nodes_qemu_start: (node: string, vmid: string) => string; // /nodes/{node}/qemu/{vmid}/status/start
    nodes_qemu_shutdown: (node: string, vmid: string) => string; // /nodes/{node}/qemu/{vmid}/status/shutdown
    nodes_qemu_stop: (node: string, vmid: string) => string; // /nodes/{node}/qemu/{vmid}/status/stop
    nodes_qemu_reboot: (node: string, vmid: string) => string; // /nodes/{node}/qemu/{vmid}/status/reboot
    nodes_qemu_reset: (node: string, vmid: string) => string; // /nodes/{node}/qemu/{vmid}/status/reset
    nodes_qemu: (node: string) => string; // /nodes/{node}/qemu
    nodes_storage?: (node: string) => string; // /nodes/{node}/storage (list storages on node)
    cluster_next_id: string; // /cluster/nextid
    nodes_qemu_clone: (node:string,template_vmid:string) => string; // /nodes/{node}/qemu/{template_vmid}/clone
    nodes_tasks_status: (node: string, upid: string) => string; // /nodes/{node}/tasks/{upid}/status
    nodes_qemu_resize: (node: string, vmid: string) => string; // /nodes/{node}/qemu/{vmid}/resize
    nodes_qemu_vm: (node: string, vmid: string) => string; // /nodes/{node}/qemu/{vmid}
    nodes_storage_content: (node: string, storage: string, volume: string) => string; // /nodes/{node}/storage/{storage}/content/{volume}
    nodes_qemu_rrddata: (node: string, vmid: string) => string; // /nodes/{node}/qemu/{vmid}/rrddata
    nodes_qemu_template: (node: string, vmid: string) => string; // /nodes/{node}/qemu/{vmid}/template
}

// Node status returned by getDatacenterStatus
export interface NodeStatus {
    name: string;
    online: boolean;
    address: string;
    cpu_percent: number;
    memory_percent: number;
    uptime: {
        days: number;
        hours: number;
        minutes: number;
        seconds: number;
    };
}

// Raw PVE node resource info (renamed from original PVE_Node to avoid collisions)
export interface PVE_NodeStatus {
    node: string;
    status: string;
    id: string;
    cpu: number;
    maxcpu: number;
    mem: number;
    maxmem: number;
    disk: number;
    maxdisk: number;
    uptime: number;
}