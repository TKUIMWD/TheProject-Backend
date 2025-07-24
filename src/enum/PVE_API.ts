import { PVEApiEndPoints } from "../interfaces/ApiEndPoints";

const pve_api_base = process.env.PVE_API_BASE_URL;

export const pve_api: PVEApiEndPoints = {
    test: `${pve_api_base}/test`,
    access_ticket: `${pve_api_base}/access/ticket`,
    nodes: `${pve_api_base}/nodes`,
    nodes_qemu: (node: string) => `${pve_api_base}/nodes/${node}/qemu`,
    nodes_qemu_config: (node: string, vmid: string) => `${pve_api_base}/nodes/${node}/qemu/${vmid}/config`,
    nodes_qemu_status: (node: string, vmid: string) => `${pve_api_base}/nodes/${node}/qemu/${vmid}/status/current`,
    nodes_qemu_cloudinit: (node: string, vmid: string) => `${pve_api_base}/nodes/${node}/qemu/${vmid}/cloudinit`,
    nodes_qemu_agent: (node: string, vmid: string) => `${pve_api_base}/nodes/${node}/qemu/${vmid}/agent`,
    nodes_qemu_agent_network: (node: string, vmid: string) => `${pve_api_base}/nodes/${node}/qemu/${vmid}/agent/network-get-interfaces`,
    nodes_qemu_start: (node: string, vmid: string) => `${pve_api_base}/nodes/${node}/qemu/${vmid}/status/start`,
    nodes_qemu_shutdown: (node: string, vmid: string) => `${pve_api_base}/nodes/${node}/qemu/${vmid}/status/shutdown`,
    nodes_qemu_stop: (node: string, vmid: string) => `${pve_api_base}/nodes/${node}/qemu/${vmid}/status/stop`,
    nodes_qemu_reboot: (node: string, vmid: string) => `${pve_api_base}/nodes/${node}/qemu/${vmid}/status/reboot`,
    nodes_qemu_reset: (node: string, vmid: string) => `${pve_api_base}/nodes/${node}/qemu/${vmid}/status/reset`,
    cluster_next_id: `${pve_api_base}/cluster/nextid`,
    nodes_qemu_clone: (node: string, template_vmid: string) => `${pve_api_base}/nodes/${node}/qemu/${template_vmid}/clone`,
    nodes_tasks_status: (node: string, upid: string) => `${pve_api_base}/nodes/${node}/tasks/${upid}/status`,
    nodes_qemu_resize: (node: string, vmid: string) => `${pve_api_base}/nodes/${node}/qemu/${vmid}/resize`,
    nodes_qemu_vm: (node: string, vmid: string) => `${pve_api_base}/nodes/${node}/qemu/${vmid}`,
    nodes_storage_content: (node: string, storage: string, volume: string) => `${pve_api_base}/nodes/${node}/storage/${storage}/content/${volume}`,
    nodes_qemu_rrddata: (node: string, vmid: string) => `${pve_api_base}/nodes/${node}/qemu/${vmid}/rrddata`,
    nodes_qemu_template: (node: string, vmid: string) => `${pve_api_base}/nodes/${node}/qemu/${vmid}/template`,
};