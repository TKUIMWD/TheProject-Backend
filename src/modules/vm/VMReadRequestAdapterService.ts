import { User } from "../../interfaces/User";
import { SimplifiedNetworkInterface, VMDetailWithBasicConfig } from "../../interfaces/VM/VM";
import { resp } from "../../utils/resp";
import { vmReadService } from "./VMReadService";

type VMReadAdapterInput = {
    user: User;
    isSuperAdmin?: boolean;
    query?: Record<string, any>;
};

type VMReadRequestAdapterServiceDeps = {
    read?: {
        listUserOwnedVMs(user: User): Promise<resp<VMDetailWithBasicConfig[] | undefined>>;
        listAllVMs(): Promise<resp<VMDetailWithBasicConfig[] | undefined>>;
        getVMStatus(input: {
            user: User;
            isSuperAdmin: boolean;
            vmId: unknown;
        }): Promise<resp<{ status: string; uptime?: number; resourceUsage?: { cpu: number; memory: number } } | undefined>>;
        getVMNetworkInfo(input: {
            user: User;
            isSuperAdmin: boolean;
            vmId: unknown;
        }): Promise<resp<{ interfaces: SimplifiedNetworkInterface[] } | undefined>>;
    };
};

export class VMReadRequestAdapterService {
    private readonly read: NonNullable<VMReadRequestAdapterServiceDeps["read"]>;

    constructor(deps: VMReadRequestAdapterServiceDeps = {}) {
        this.read = deps.read ?? vmReadService;
    }

    public listUserOwnedVMs(input: VMReadAdapterInput): Promise<resp<VMDetailWithBasicConfig[] | undefined>> {
        return this.read.listUserOwnedVMs(input.user);
    }

    public listAllVMs(): Promise<resp<VMDetailWithBasicConfig[] | undefined>> {
        return this.read.listAllVMs();
    }

    public getVMStatus(input: VMReadAdapterInput): Promise<resp<{ status: string; uptime?: number; resourceUsage?: { cpu: number; memory: number } } | undefined>> {
        return this.read.getVMStatus({
            user: input.user,
            isSuperAdmin: input.isSuperAdmin === true,
            vmId: input.query?.vm_id
        });
    }

    public getVMNetworkInfo(input: VMReadAdapterInput): Promise<resp<{ interfaces: SimplifiedNetworkInterface[] } | undefined>> {
        return this.read.getVMNetworkInfo({
            user: input.user,
            isSuperAdmin: input.isSuperAdmin === true,
            vmId: input.query?.vm_id
        });
    }
}

export const vmReadRequestAdapterService = new VMReadRequestAdapterService();
