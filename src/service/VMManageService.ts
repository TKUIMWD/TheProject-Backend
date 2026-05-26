import { Service } from "../abstract/Service";
import { PVEResp } from "../interfaces/Response/PVEResp";
import { VMDeletionResponse } from "../interfaces/Response/VMResp";
import { User } from "../interfaces/User";
import { vmManageRequestAdapterService } from "../modules/vm/VMManageRequestAdapterService";
import { resp } from "../utils/resp";

export type VMManageServiceInput = {
    user: User;
    body: any;
    tokenRole?: string;
};

export class VMManageService extends Service {
    public createVMFromTemplate(input: VMManageServiceInput): Promise<resp<PVEResp | undefined>> {
        return vmManageRequestAdapterService.createVMFromTemplate(input);
    }

    public deleteUserVM(input: VMManageServiceInput & { tokenRole: string }): Promise<resp<VMDeletionResponse | undefined>> {
        return vmManageRequestAdapterService.deleteUserVM(input);
    }

    public updateVMConfig(input: VMManageServiceInput): Promise<resp<PVEResp | undefined>> {
        return vmManageRequestAdapterService.updateVMConfig(input);
    }

    public createVMFromBoxTemplate(input: VMManageServiceInput): Promise<resp<PVEResp | undefined>> {
        return vmManageRequestAdapterService.createVMFromBoxTemplate(input);
    }
}
