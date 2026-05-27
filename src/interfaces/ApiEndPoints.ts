export interface PVEApiEndPoints {
    test: string; // /test
    access_ticket: string;  // /access/ticket
    nodes: string; // /nodes
    cluster_resources_nodes: string; // /cluster/resources?type=node
    cluster_resources_vms: string; // /cluster/resources?type=vm
    nodes_qemu_config: (node: string, vmid: string) => string; // /nodes/{node}/qemu/{vmid}/config
    nodes_qemu_status: (node: string, vmid: string) => string; // /nodes/{node}/qemu/{vmid}/status/current
    nodes_qemu_cloudinit: (node: string, vmid: string) => string; // /nodes/{node}/qemu/{vmid}/cloudinit
    nodes_qemu_agent: (node: string, vmid: string) => string; // /nodes/{node}/qemu/{vmid}/agent
    nodes_qemu_agent_network: (node: string, vmid: string) => string; // /nodes/{node}/qemu/{vmid}/agent/network-get-interfaces
    nodes_qemu_agent_exec: (node: string, vmid: string) => string; // /nodes/{node}/qemu/{vmid}/agent/exec
    nodes_qemu_agent_exec_status: (node: string, vmid: string, pid: string | number) => string; // /nodes/{node}/qemu/{vmid}/agent/exec-status
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
    node?: string;
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

export interface VMInventoryStatus {
    id: string;
    vmid: number;
    name: string;
    node: string;
    type: string;
    status: string;
    template: boolean;
    cpu_percent: number;
    memory_used_gb: number;
    memory_total_gb: number;
    memory_percent: number;
    disk_used_gb: number;
    disk_total_gb: number;
    disk_percent: number;
    uptime: {
        days: number;
        hours: number;
        minutes: number;
        seconds: number;
    };
}

export interface PVE_VMInventoryResource {
    id?: string;
    vmid?: number;
    name?: string;
    node?: string;
    type?: string;
    status?: string;
    template?: number | boolean;
    cpu?: number;
    maxcpu?: number;
    mem?: number;
    maxmem?: number;
    disk?: number;
    maxdisk?: number;
    uptime?: number;
}

export interface StorageDetailsStatus {
    id: string;
    node: string;
    name: string;
    type: string;
    shared: boolean;
    used_gb: number;
    total_gb: number;
    used_tb: number;
    total_tb: number;
    usage_percent: number;
    state: "normal" | "warning" | "critical";
}

export interface PVE_StorageResource {
    storage?: string;
    name?: string;
    id?: string;
    volid?: string;
    type?: string;
    shared?: number | boolean;
    used?: number;
    total?: number;
    disk?: number;
    maxdisk?: number;
}

export interface PVEVMDetailStatus {
    vmid: number;
    name: string;
    node: string;
    type: string;
    template: boolean;
    status: string;
    uptime_seconds?: number;
    cpu_percent: number;
    memory_used_gb: number;
    memory_total_gb: number;
    memory_percent: number;
    disk_gb: number;
    config: {
        cores: number;
        memory_mb: number;
        bootdisk?: string;
        ostype?: string;
        net0?: string;
    };
    network: {
        interfaces: Array<{
            name: string;
            macAddress: string;
            ipAddresses: string[];
        }>;
        error?: string;
    };
}

export interface PVEVMOperationResult {
    node: string;
    vmid: number;
    action: "start" | "shutdown" | "reboot" | "stop";
    upid?: string;
    status_before: string;
}

export interface PVEVMBatchDeleteTarget {
    node: string;
    vmid: number;
    name?: string;
}

export interface PVEVMBatchDeleteItemResult {
    node: string;
    vmid: number;
    name?: string;
    ok: boolean;
    detail: string;
    upid?: string;
    status_before?: string;
}

export interface PVEVMBatchDeleteResult {
    deleted: number;
    failed: number;
    results: PVEVMBatchDeleteItemResult[];
}

export interface PVEDashboardTrendPoint {
    timestamp: string;
    cpu_percent: number;
    memory_percent: number;
    storage_percent: number;
    online_nodes: number;
    offline_nodes: number;
}
