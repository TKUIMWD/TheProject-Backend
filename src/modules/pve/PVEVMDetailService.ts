import { pve_api } from "../../enum/PVE_API";
import { PVEResp } from "../../interfaces/Response/PVEResp";
import { logger } from "../../middlewares/log";
import { createResponse, resp } from "../../utils/resp";
import { PVEClient, pveClient } from "./PVEClient";
import { buildPVEVMDetailStatus, validatePVEVMDetailQuery } from "./PVEVMDetailPolicy";

type PVEVMDetailServiceDeps = {
    pve?: Pick<PVEClient, "request">;
};

export class PVEVMDetailService {
    private readonly pve: Pick<PVEClient, "request">;

    constructor(deps: PVEVMDetailServiceDeps = {}) {
        this.pve = deps.pve ?? pveClient;
    }

    public async getVMDetail(input: { node?: unknown; vmid?: unknown }): Promise<resp<any>> {
        const target = validatePVEVMDetailQuery(input);
        if (!target.valid || !target.node || !target.vmid) {
            return createResponse(400, target.message || "Invalid VM detail query");
        }

        try {
            const [configResp, statusResp] = await Promise.all([
                this.pve.request("GET", pve_api.nodes_qemu_config(target.node, target.vmid), undefined, { mode: "admin" }),
                this.pve.request("GET", pve_api.nodes_qemu_status(target.node, target.vmid), undefined, { mode: "admin" })
            ]) as [PVEResp, PVEResp];

            if (!configResp || !configResp.data) {
                return createResponse(404, "QEMU config not found");
            }

            const status = statusResp?.data || {};
            const network = await this.loadNetworkInfo(target.node, target.vmid, status.status);

            return createResponse(200, "PVE VM detail fetched successfully", buildPVEVMDetailStatus({
                node: target.node,
                vmid: target.vmid,
                config: configResp.data,
                status,
                networkInterfaces: network.interfaces,
                networkError: network.error
            }));
        } catch (error) {
            logger.error("Error in PVEVMDetailService.getVMDetail:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    private async loadNetworkInfo(node: string, vmid: string, status?: string): Promise<{ interfaces?: unknown; error?: string }> {
        if (status !== "running") {
            return { interfaces: [], error: "VM is not running" };
        }

        try {
            const networkResp: PVEResp = await this.pve.request("GET", pve_api.nodes_qemu_agent_network(node, vmid), undefined, { mode: "admin" });
            return { interfaces: networkResp?.data };
        } catch (error) {
            logger.warn(`Failed to load VM network info for ${node}/${vmid}:`, error);
            return { interfaces: [], error: "Network information unavailable" };
        }
    }
}

export const pveVMDetailService = new PVEVMDetailService();
