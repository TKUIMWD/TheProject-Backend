import { PVEApiEndPoints } from "../interfaces/ApiEndPoints";

const pve_api_base = process.env.PVE_API_BASE_URL;

export const pve_api: PVEApiEndPoints = {
    test: `${pve_api_base}/test`,
    access_ticket: `${pve_api_base}/access/ticket`,
    nodes: `${pve_api_base}/nodes`,
    nodes_qemu: (node: string) => `${pve_api_base}/nodes/${node}/qemu`,
    nodes_qemu_config: (node: string, vmid: string) => `${pve_api_base}/nodes/${node}/qemu/${vmid}/config`,
    cluster_next_id: `${pve_api_base}/cluster/nextid`,
    nodes_qemu_clone: (node: string, template_vmid: string) => `${pve_api_base}/nodes/${node}/qemu/${template_vmid}/clone`
};