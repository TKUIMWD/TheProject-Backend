import { PVEApiEndPoints } from "../interfaces/ApiEndPoints";

const pve_api_base = process.env.PVE_API_BASE_URL;

export const pve_api: PVEApiEndPoints = {
    access_ticket: `${pve_api_base}/access/ticket`,  // /access/ticket
    nodes: `${pve_api_base}/nodes`, // /nodes
    nodes_qemu: (node: string) => `${pve_api_base}/nodes/${node}/qemu`, // /nodes/{node}/qemu
    qemu_config: (node: string, vmid: string) => `${pve_api_base}/nodes/${node}/qemu/${vmid}/config`, // /nodes/{node}/qemu/{vmid}/config
};