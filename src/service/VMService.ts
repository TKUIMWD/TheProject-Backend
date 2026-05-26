import { User } from "../interfaces/User";
import { SimplifiedNetworkInterface, VMDetailWithBasicConfig } from "../interfaces/VM/VM";
import { vmReadRequestAdapterService } from "../modules/vm/VMReadRequestAdapterService";
import { Service } from "../abstract/Service";
import { resp } from "../utils/resp";

export type VMReadServiceInput = {
    user: User;
    isSuperAdmin?: boolean;
    query?: Record<string, any>;
};

export class VMService extends Service {
    public getUserOwnedVMs(user: User): Promise<resp<VMDetailWithBasicConfig[] | undefined>> {
        return vmReadRequestAdapterService.listUserOwnedVMs({ user });
    }

    public getAllVMs(): Promise<resp<VMDetailWithBasicConfig[] | undefined>> {
        return vmReadRequestAdapterService.listAllVMs();
    }

    public getVMStatus(input: VMReadServiceInput): Promise<resp<{ status: string; uptime?: number; resourceUsage?: { cpu: number; memory: number } } | undefined>> {
        return vmReadRequestAdapterService.getVMStatus(input);
    }

    public getVMNetworkInfo(input: VMReadServiceInput): Promise<resp<{ interfaces: SimplifiedNetworkInterface[] } | undefined>> {
        return vmReadRequestAdapterService.getVMNetworkInfo(input);
    }
}
