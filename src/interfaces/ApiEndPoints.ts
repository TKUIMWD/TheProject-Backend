export interface PVEApiEndPoints {
    test: string; // POST /test
    access_ticket: string;  // /access/ticket
    nodes: string; // /nodes
    qemu_config: (node: string, vmid: string) => string; // /nodes/{node}/qemu/{vmid}/config
    nodes_qemu: (node: string) => string; // /nodes/{node}/qemu
    cluster_next_id: string; // /cluster/nextid
}