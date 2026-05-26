import { User } from "../../interfaces/User";
import { VMDeletionResponse } from "../../interfaces/Response/VMResp";
import { createResponse, resp } from "../../utils/resp";
import { validateObjectIdInput } from "../common/ObjectIdPolicy";
import { canDeleteVMByOwnership } from "./VMDeletionPolicy";
import { vmRepository } from "./VMRepository";
import { vmDeletionWorkflowService } from "./VMDeletionWorkflowService";

type VMDeletionAccessRepositoryPort = {
    findById(vmId: string): Promise<any | null>;
};

type VMDeletionWorkflowPort = {
    deleteUserVM(input: {
        vmId: string;
        vm: any;
    }): Promise<resp<VMDeletionResponse | undefined>>;
};

export type VMDeletionAccessServiceDeps = {
    vmRepository?: VMDeletionAccessRepositoryPort;
    deletionWorkflow?: VMDeletionWorkflowPort;
};

export class VMDeletionAccessService {
    private readonly vmRepository: VMDeletionAccessRepositoryPort;
    private readonly deletionWorkflow: VMDeletionWorkflowPort;

    constructor(deps: VMDeletionAccessServiceDeps = {}) {
        this.vmRepository = deps.vmRepository ?? vmRepository;
        this.deletionWorkflow = deps.deletionWorkflow ?? vmDeletionWorkflowService;
    }

    public async deleteUserVM(input: {
        user: User;
        tokenRole: string;
        vmId: unknown;
    }): Promise<resp<VMDeletionResponse | undefined>> {
        const vmIdResult = validateObjectIdInput(input.vmId, "vm_id");
        if (!vmIdResult.valid) {
            return createResponse(400, vmIdResult.message);
        }
        const normalizedVmId = vmIdResult.value;

        const ownershipDecision = canDeleteVMByOwnership({
            tokenRole: input.tokenRole,
            ownedVmIds: input.user.owned_vms,
            vmId: normalizedVmId
        });
        if (!ownershipDecision.allowed) {
            return createResponse(403, ownershipDecision.message);
        }

        const vm = await this.vmRepository.findById(normalizedVmId);
        if (!vm) {
            return createResponse(404, "VM not found");
        }

        return this.deletionWorkflow.deleteUserVM({
            vmId: normalizedVmId,
            vm
        });
    }
}

export const vmDeletionAccessService = new VMDeletionAccessService();
