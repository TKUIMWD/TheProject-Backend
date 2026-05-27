import { pve_api } from "../../enum/PVE_API";
import { PVEVMBatchDeleteItemResult } from "../../interfaces/ApiEndPoints";
import { PVEResp } from "../../interfaces/Response/PVEResp";
import { logger } from "../../middlewares/log";
import { createResponse, resp } from "../../utils/resp";
import { PVEClient, pveClient } from "./PVEClient";
import {
    buildPVEVMBatchDeleteItemResult,
    canDeletePVEVM,
    validatePVEVMBatchDeleteInput
} from "./PVEVMBatchDeletePolicy";

type PVEVMBatchDeleteServiceDeps = {
    pve?: Pick<PVEClient, "request">;
};

export class PVEVMBatchDeleteService {
    private readonly pve: Pick<PVEClient, "request">;

    constructor(deps: PVEVMBatchDeleteServiceDeps = {}) {
        this.pve = deps.pve ?? pveClient;
    }

    public async deleteVMs(input: { targets?: unknown }): Promise<resp<any>> {
        const parsed = validatePVEVMBatchDeleteInput(input);
        if (!parsed.valid) {
            return createResponse(400, parsed.message);
        }

        const results: PVEVMBatchDeleteItemResult[] = [];
        for (const target of parsed.targets) {
            results.push(await this.deleteOne(target));
        }

        const deleted = results.filter((result) => result.ok).length;
        const failed = results.length - deleted;
        return createResponse(failed > 0 ? 207 : 202, failed > 0 ? "Batch delete completed with failures" : "Batch delete tasks submitted", {
            deleted,
            failed,
            results
        });
    }

    private async deleteOne(target: { node: string; vmid: number; name?: string }): Promise<PVEVMBatchDeleteItemResult> {
        try {
            const [statusResp, configResp] = await Promise.all([
                this.pve.request("GET", pve_api.nodes_qemu_status(target.node, String(target.vmid)), undefined, { mode: "admin" }) as Promise<PVEResp>,
                this.pve.request("GET", pve_api.nodes_qemu_config(target.node, String(target.vmid)), undefined, { mode: "admin" }) as Promise<PVEResp>
            ]);
            const statusBefore = statusResp?.data?.status || "unknown";
            const deleteDecision = canDeletePVEVM({
                status: statusBefore,
                template: configResp?.data?.template
            });
            if (!deleteDecision.allowed) {
                return buildPVEVMBatchDeleteItemResult({
                    target,
                    ok: false,
                    detail: deleteDecision.detail,
                    statusBefore
                });
            }

            const deleteResp: PVEResp = await this.pve.request("DELETE", pve_api.nodes_qemu_vm(target.node, String(target.vmid)), undefined, { mode: "admin" });
            return buildPVEVMBatchDeleteItemResult({
                target,
                ok: true,
                detail: "Delete task submitted",
                upid: deleteResp?.data,
                statusBefore
            });
        } catch (error) {
            logger.error(`Error deleting PVE VM ${target.node}/${target.vmid}:`, error);
            return buildPVEVMBatchDeleteItemResult({
                target,
                ok: false,
                detail: error instanceof Error ? error.message : "Delete failed"
            });
        }
    }
}

export const pveVMBatchDeleteService = new PVEVMBatchDeleteService();
