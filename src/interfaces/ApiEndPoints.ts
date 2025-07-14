export interface PVEApiEndPoints {
    test: string; // /test
    access_ticket: string;  // /access/ticket
    nodes: string; // /nodes
    nodes_qemu_config: (node: string, vmid: string) => string; // /nodes/{node}/qemu/{vmid}/config
    nodes_qemu: (node: string) => string; // /nodes/{node}/qemu
    cluster_next_id: string; // /cluster/nextid
    nodes_qemu_clone: (node:string,template_vmid:string) => string; // /nodes/{node}/qemu/{template_vmid}/clone
}