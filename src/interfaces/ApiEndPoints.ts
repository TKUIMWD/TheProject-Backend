export interface PVEApiEndPoints {
    access_ticket: string;  // /access/ticket
    nodes: string; // /nodes
    qemu_config: (node: string, vmid: string) => string; // /nodes/{node}/qemu/{vmid}/config
    nodes_qemu: (node: string) => string; // /nodes/{node}/qemu
}