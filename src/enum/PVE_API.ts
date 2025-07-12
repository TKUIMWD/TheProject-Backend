import { PVEApiEndPoints } from "../interfaces/ApiEndPoints";

const pve_api_base = process.env.PVE_API_BASE_URL;

export const pve_api: PVEApiEndPoints = {
    access_ticket: `${pve_api_base}/access/ticket`,  // POST /access/ticket
    nodes: `${pve_api_base}/nodes`, // GET /nodes
    nodes_qemu: (node: string) => `${pve_api_base}/nodes/${node}/qemu`, // POST /nodes/{node}/qemu
    qemu_config: (node: string, vmid: string) => `${pve_api_base}/nodes/${node}/qemu/${vmid}/config`, // GET /nodes/{node}/qemu/{vmid}/config
    cluster_next_id: `${pve_api_base}/cluster/nextid`, // GET /cluster/nextid
};

/*
access_ticket: 取得訪問 ticket
nodes: 取得節點列表 -> /api/v1/pve/getNodes
nodes_qemu: 創建 QEMU 虛擬機
qemu_config: 取得 QEMU 虛擬機配置
cluster_next_id: 取得集群下一個可用 ID -> /api/v1/pve/getNextId
*/