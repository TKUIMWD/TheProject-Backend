import { PVEResp } from "../../interfaces/Response/PVEResp";
import { VMDeletionResponse } from "../../interfaces/Response/VMResp";
import { User } from "../../interfaces/User";
import { resp } from "../../utils/resp";
import { vmConfigUpdateWorkflowService } from "./VMConfigUpdateWorkflowService";
import { vmCreationRequestService } from "./VMCreationRequestService";
import { vmDeletionAccessService } from "./VMDeletionAccessService";

type VMManageRequestAdapterServiceDeps = {
    creationRequest?: {
        createFromTemplate(input: {
            user: User;
            body: Record<string, unknown>;
        }): Promise<resp<PVEResp | undefined>>;
        createFromBoxTemplate(input: {
            user: User;
            body: Record<string, unknown>;
        }): Promise<resp<PVEResp | undefined>>;
    };
    configUpdate?: {
        updateVMConfig(input: {
            user: User;
            body: Record<string, unknown>;
        }): Promise<resp<PVEResp | undefined>>;
    };
    deletionAccess?: {
        deleteUserVM(input: {
            user: User;
            tokenRole: string;
            vmId: unknown;
        }): Promise<resp<VMDeletionResponse | undefined>>;
    };
};

export class VMManageRequestAdapterService {
    private readonly creationRequest: NonNullable<VMManageRequestAdapterServiceDeps["creationRequest"]>;
    private readonly configUpdate: NonNullable<VMManageRequestAdapterServiceDeps["configUpdate"]>;
    private readonly deletionAccess: NonNullable<VMManageRequestAdapterServiceDeps["deletionAccess"]>;

    constructor(deps: VMManageRequestAdapterServiceDeps = {}) {
        this.creationRequest = deps.creationRequest ?? vmCreationRequestService;
        this.configUpdate = deps.configUpdate ?? vmConfigUpdateWorkflowService;
        this.deletionAccess = deps.deletionAccess ?? vmDeletionAccessService;
    }

    public async createVMFromTemplate(input: {
        user: User;
        body: Record<string, unknown>;
    }): Promise<resp<PVEResp | undefined>> {
        return this.creationRequest.createFromTemplate(input);
    }

    public async createVMFromBoxTemplate(input: {
        user: User;
        body: Record<string, unknown>;
    }): Promise<resp<PVEResp | undefined>> {
        return this.creationRequest.createFromBoxTemplate(input);
    }

    public async updateVMConfig(input: {
        user: User;
        body: Record<string, unknown>;
    }): Promise<resp<PVEResp | undefined>> {
        return this.configUpdate.updateVMConfig(input);
    }

    public async deleteUserVM(input: {
        user: User;
        tokenRole: string;
        body: { vm_id?: unknown };
    }): Promise<resp<VMDeletionResponse | undefined>> {
        return this.deletionAccess.deleteUserVM({
            user: input.user,
            tokenRole: input.tokenRole,
            vmId: input.body.vm_id
        });
    }
}

export const vmManageRequestAdapterService = new VMManageRequestAdapterService();
