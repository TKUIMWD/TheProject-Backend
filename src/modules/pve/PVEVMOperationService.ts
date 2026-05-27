import { pve_api } from "../../enum/PVE_API";
import { PVEResp } from "../../interfaces/Response/PVEResp";
import { logger } from "../../middlewares/log";
import { createResponse, resp } from "../../utils/resp";
import { PVEClient, pveClient } from "./PVEClient";
import {
    buildPVEVMOperationResult,
    getPVEVMOperationSuccessMessage,
    PVEDashboardVMOperation,
    validatePVEVMOperationInput,
    validatePVEVMOperationState
} from "./PVEVMOperationPolicy";

type PVEVMOperationServiceDeps = {
    pve?: Pick<PVEClient, "request">;
};

export class PVEVMOperationService {
    private readonly pve: Pick<PVEClient, "request">;

    constructor(deps: PVEVMOperationServiceDeps = {}) {
        this.pve = deps.pve ?? pveClient;
    }

    public async operateVM(input: { node?: unknown; vmid?: unknown; action?: unknown }): Promise<resp<any>> {
        const target = validatePVEVMOperationInput(input);
        if (!target.valid) {
            return createResponse(400, target.message);
        }

        try {
            const statusResp: PVEResp = await this.pve.request("GET", pve_api.nodes_qemu_status(target.node, target.vmid), undefined, { mode: "admin" });
            const currentStatus = statusResp?.data?.status || "unknown";
            const stateDecision = validatePVEVMOperationState(target.action, currentStatus);
            if (!stateDecision.allowed) {
                return createResponse(400, stateDecision.message);
            }

            const operationResp: PVEResp = await this.pve.request(
                "POST",
                this.getOperationUrl(target.action, target.node, target.vmid),
                undefined,
                { mode: "admin", headers: { "Content-Type": "application/x-www-form-urlencoded" } }
            );

            if (!operationResp?.data) {
                return createResponse(500, "No response data from VM operation");
            }

            return createResponse(202, getPVEVMOperationSuccessMessage(target.action), buildPVEVMOperationResult({
                node: target.node,
                vmid: target.vmid,
                action: target.action,
                upid: operationResp.data,
                statusBefore: currentStatus
            }));
        } catch (error) {
            logger.error("Error in PVEVMOperationService.operateVM:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    private getOperationUrl(action: PVEDashboardVMOperation, node: string, vmid: string): string {
        switch (action) {
            case "start":
                return pve_api.nodes_qemu_start(node, vmid);
            case "shutdown":
                return pve_api.nodes_qemu_shutdown(node, vmid);
            case "reboot":
                return pve_api.nodes_qemu_reboot(node, vmid);
            case "stop":
                return pve_api.nodes_qemu_stop(node, vmid);
        }
    }
}

export const pveVMOperationService = new PVEVMOperationService();
