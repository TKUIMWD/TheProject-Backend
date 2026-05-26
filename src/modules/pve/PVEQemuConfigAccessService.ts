import { pve_api } from "../../enum/PVE_API";
import { PVEResp } from "../../interfaces/Response/PVEResp";
import { User } from "../../interfaces/User";
import { VM, VMBasicConfig, VMDetailedConfig } from "../../interfaces/VM/VM";
import { logger } from "../../middlewares/log";
import { VMModel } from "../../orm/schemas/VM/VMSchemas";
import { createResponse, resp } from "../../utils/resp";
import { validateObjectIdInput } from "../common/ObjectIdPolicy";
import { PVEClient, pveClient } from "./PVEClient";
import {
    buildBasicQemuConfigDTO,
    buildDetailedQemuConfigDTO
} from "./PVEQemuConfigDTOFactory";

export type PVEQemuConfigRole = "user" | "admin" | "superadmin";

type VMRepository = {
    findById(vmId: string): Promise<VM | null>;
};

type PVEQemuConfigAccessServiceDeps = {
    vmRepo?: VMRepository;
    pve?: Pick<PVEClient, "request">;
};

const vmModelRepository: VMRepository = {
    async findById(vmId: string): Promise<VM | null> {
        return VMModel.findById(vmId).exec();
    }
};

export class PVEQemuConfigAccessService {
    private readonly vmRepo: VMRepository;
    private readonly pve: Pick<PVEClient, "request">;

    constructor(deps: PVEQemuConfigAccessServiceDeps = {}) {
        this.vmRepo = deps.vmRepo ?? vmModelRepository;
        this.pve = deps.pve ?? pveClient;
    }

    public async getQemuConfig(input: {
        role: PVEQemuConfigRole;
        user: User;
        vmId: unknown;
    }): Promise<resp<VMBasicConfig | VMDetailedConfig | PVEResp["data"] | undefined>> {
        try {
            const vmIdResult = validateObjectIdInput(input.vmId, "vm_id");
            if (!vmIdResult.valid) {
                return createResponse(400, vmIdResult.message);
            }

            const normalizedVmId = vmIdResult.value;
            if (input.role !== "superadmin" && !input.user.owned_vms.includes(normalizedVmId)) {
                return createResponse(403, "Access denied: VM not owned by user");
            }

            const vm = await this.vmRepo.findById(normalizedVmId);
            if (!vm) {
                return createResponse(404, "VM not found");
            }

            if (input.role === "user") {
                return this.getBasicQemuConfig(vm.pve_node, vm.pve_vmid);
            }

            if (input.role === "admin") {
                return this.getDetailedQemuConfig(vm.pve_node, vm.pve_vmid);
            }

            return this.getFullQemuConfig(vm.pve_node, vm.pve_vmid);
        } catch (error) {
            logger.error("Error in PVEQemuConfigAccessService.getQemuConfig:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    private async getBasicQemuConfig(node: string, vmid: string): Promise<resp<VMBasicConfig | undefined>> {
        try {
            const qemuConfig: PVEResp = await this.pve.request(
                "GET",
                pve_api.nodes_qemu_config(node, vmid),
                undefined,
                { mode: "user" }
            );

            if (!qemuConfig || !qemuConfig.data) {
                return createResponse(404, "QEMU config not found");
            }

            return createResponse(
                200,
                "Basic QEMU config fetched successfully",
                buildBasicQemuConfigDTO(node, qemuConfig.data)
            );
        } catch (error) {
            logger.error("Error in PVEQemuConfigAccessService.getBasicQemuConfig:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    private async getDetailedQemuConfig(node: string, vmid: string): Promise<resp<VMDetailedConfig | undefined>> {
        try {
            const qemuConfig: PVEResp = await this.pve.request(
                "GET",
                pve_api.nodes_qemu_config(node, vmid),
                undefined,
                { mode: "admin" }
            );

            if (!qemuConfig || !qemuConfig.data) {
                return createResponse(404, "QEMU config not found");
            }

            return createResponse(
                200,
                "Detailed QEMU config fetched successfully",
                buildDetailedQemuConfigDTO(node, qemuConfig.data)
            );
        } catch (error) {
            logger.error("Error in PVEQemuConfigAccessService.getDetailedQemuConfig:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    private async getFullQemuConfig(node: string, vmid: string): Promise<resp<PVEResp["data"] | undefined>> {
        try {
            const qemuConfig: PVEResp = await this.pve.request(
                "GET",
                pve_api.nodes_qemu_config(node, vmid)
            );

            if (!qemuConfig || !qemuConfig.data) {
                return createResponse(404, "QEMU config not found");
            }

            return createResponse(200, "Full QEMU config fetched successfully", qemuConfig.data);
        } catch (error) {
            logger.error("Error in PVEQemuConfigAccessService.getFullQemuConfig:", error);
            return createResponse(500, "Internal Server Error");
        }
    }
}

export const pveQemuConfigAccessService = new PVEQemuConfigAccessService();
