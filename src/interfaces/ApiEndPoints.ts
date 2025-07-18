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
    cluster_next_id: string; // /cluster/nextid
    nodes_qemu_clone: (node:string,template_vmid:string) => string; // /nodes/{node}/qemu/{template_vmid}/clone
    nodes_tasks_status: (node: string, upid: string) => string; // /nodes/{node}/tasks/{upid}/status
    nodes_qemu_resize: (node: string, vmid: string) => string; // /nodes/{node}/qemu/{vmid}/resize
    nodes_qemu_vm: (node: string, vmid: string) => string; // /nodes/{node}/qemu/{vmid}
    nodes_storage_content: (node: string, storage: string, volume: string) => string; // /nodes/{node}/storage/{storage}/content/{volume}
}