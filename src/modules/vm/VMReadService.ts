import { User } from "../../interfaces/User";
import {
    VMBasicConfig,
    VMDetailWithBasicConfig,
    NetworkIPAddress,
    NetworkInterface,
    NetworkInterfacesResponse,
    SimplifiedNetworkInterface
} from "../../interfaces/VM/VM";
import { logger } from "../../middlewares/log";
import { UsersModel } from "../../orm/schemas/UserSchemas";
import { VMModel } from "../../orm/schemas/VM/VMSchemas";
import { VMUtils } from "../../utils/VMUtils";
import { createResponse, resp } from "../../utils/resp";
import { validateVMOperationTargetId } from "./VMOperationPolicy";
import {
    buildVMListErrorDTO,
    buildVMListItemDTO,
    buildVMOwnerNameMap,
    collectVMOwnerIds,
    getVMOwnerName
} from "./VMListDTOFactory";

type VMReadRepository = {
    listByIds(vmIds: string[]): Promise<any[]>;
    listAll(): Promise<any[]>;
    findById(vmId: string): Promise<any | null>;
};

type VMReadUserRepository = {
    listByIds(userIds: string[]): Promise<any[]>;
};

type VMReadUtils = {
    getBasicQemuConfig(node: string, vmid: string): Promise<resp<VMBasicConfig | undefined>>;
    getVMStatus(node: string, vmid: string): Promise<{ status: string; uptime?: number } | null>;
    getVMResourceUsage(node: string, vmid: string): Promise<{ success: boolean; cpu?: number; memory?: number }>;
    getVMNetworkInfo(node: string, vmid: string): Promise<{ success: boolean; interfaces?: NetworkInterfacesResponse | NetworkInterface[]; errorMessage?: string }>;
};

type VMReadServiceDeps = {
    vmRepo?: VMReadRepository;
    userRepo?: VMReadUserRepository;
    vmUtils?: VMReadUtils;
};

const defaultVMRepo: VMReadRepository = {
    listByIds: (vmIds) => VMModel.find({ _id: { $in: vmIds } }).exec(),
    listAll: () => VMModel.find({}).exec(),
    findById: (vmId) => VMModel.findOne({ _id: vmId }).exec()
};

const defaultUserRepo: VMReadUserRepository = {
    listByIds: (userIds) => UsersModel.find({ _id: { $in: userIds } }).lean().exec()
};

export class VMReadService {
    private readonly vmRepo: VMReadRepository;
    private readonly userRepo: VMReadUserRepository;
    private readonly vmUtils: VMReadUtils;

    constructor(deps: VMReadServiceDeps = {}) {
        this.vmRepo = deps.vmRepo ?? defaultVMRepo;
        this.userRepo = deps.userRepo ?? defaultUserRepo;
        this.vmUtils = deps.vmUtils ?? VMUtils;
    }

    public async listUserOwnedVMs(user: User): Promise<resp<VMDetailWithBasicConfig[] | undefined>> {
        if (!user.owned_vms || user.owned_vms.length === 0) {
            return createResponse(200, "No VMs found for user", []);
        }

        const vms = await this.vmRepo.listByIds(user.owned_vms);
        const vmDetails = await Promise.all(
            vms.map((vm): Promise<VMDetailWithBasicConfig> => this.buildVMListItem(vm))
        );

        return createResponse(200, "User VMs fetched successfully", vmDetails);
    }

    public async listAllVMs(): Promise<resp<VMDetailWithBasicConfig[] | undefined>> {
        const vms = await this.vmRepo.listAll();
        const ownerNameById = buildVMOwnerNameMap(
            await this.userRepo.listByIds(collectVMOwnerIds(vms))
        );

        const vmDetails = await Promise.all(
            vms.map((vm): Promise<VMDetailWithBasicConfig> => this.buildVMListItem(vm, {
                ownerName: getVMOwnerName(ownerNameById, vm.owner),
                includePveName: true
            }))
        );

        return createResponse(200, "All VMs fetched successfully", vmDetails);
    }

    public async getVMStatus(input: {
        user: User;
        isSuperAdmin: boolean;
        vmId: unknown;
    }): Promise<resp<{ status: string; uptime?: number; resourceUsage?: { cpu: number; memory: number } } | undefined>> {
        const vm = await this.findAuthorizedVM(input);
        if (!vm.allowed) {
            return vm.response;
        }

        const result = await this.vmUtils.getVMStatus(vm.vm.pve_node, vm.vm.pve_vmid);
        if (!result) {
            return createResponse(500, "Failed to get VM status");
        }

        const responseData: {
            status: string;
            uptime?: number;
            resourceUsage?: {
                cpu: number;
                memory: number;
            };
        } = {
            status: result.status,
            uptime: result.uptime
        };

        if (result.status === "running") {
            try {
                const resourceUsage = await this.vmUtils.getVMResourceUsage(vm.vm.pve_node, vm.vm.pve_vmid);
                if (resourceUsage.success) {
                    responseData.resourceUsage = {
                        cpu: resourceUsage.cpu ?? 0,
                        memory: resourceUsage.memory ?? 0
                    };
                }
            } catch (error) {
                logger.warn(`Failed to get resource usage for ${vm.vm.pve_vmid}:`, error);
            }
        }

        return createResponse(200, "VM status retrieved successfully", responseData);
    }

    public async getVMNetworkInfo(input: {
        user: User;
        isSuperAdmin: boolean;
        vmId: unknown;
    }): Promise<resp<{ interfaces: SimplifiedNetworkInterface[] } | undefined>> {
        const vm = await this.findAuthorizedVM(input);
        if (!vm.allowed) {
            return vm.response;
        }

        const statusResult = await this.vmUtils.getVMStatus(vm.vm.pve_node, vm.vm.pve_vmid);
        if (!statusResult) {
            return createResponse(500, "Failed to get VM status");
        }

        if (statusResult.status !== "running") {
            return createResponse(400, "VM must be running to get network information");
        }

        const networkInfo = await this.vmUtils.getVMNetworkInfo(vm.vm.pve_node, vm.vm.pve_vmid);
        if (!networkInfo.success) {
            return createResponse(500, networkInfo.errorMessage || "Failed to get network information");
        }

        const simplifiedInterfaces = this.simplifyNetworkInterfaces(networkInfo.interfaces || []);
        logger.debug(`Simplified ${simplifiedInterfaces.length} VM network interfaces for VM ${vm.vmId}`);

        return createResponse(200, "VM network information retrieved successfully", {
            interfaces: simplifiedInterfaces
        });
    }

    private async buildVMListItem(
        vm: any,
        options: {
            ownerName?: string;
            includePveName?: boolean;
        } = {}
    ): Promise<VMDetailWithBasicConfig> {
        try {
            const basicConfig = await this.vmUtils.getBasicQemuConfig(vm.pve_node, vm.pve_vmid);
            const vmStatus = await this.vmUtils.getVMStatus(vm.pve_node, vm.pve_vmid);

            return buildVMListItemDTO(vm, {
                basicConfig: basicConfig.body,
                basicConfigError: basicConfig.code !== 200 ? basicConfig.message : null,
                vmStatus,
                ownerName: options.ownerName,
                includePveName: options.includePveName
            });
        } catch (error) {
            return buildVMListErrorDTO(vm, "Failed to fetch VM config or status", vm.owner);
        }
    }

    private async findAuthorizedVM(input: {
        user: User;
        isSuperAdmin: boolean;
        vmId: unknown;
    }): Promise<
        | { allowed: true; vm: any; vmId: string }
        | { allowed: false; response: resp<undefined> }
    > {
        const vmIdDecision = validateVMOperationTargetId(input.vmId);
        if (!vmIdDecision.valid) {
            return { allowed: false, response: createResponse(400, vmIdDecision.message) };
        }

        const vm = await this.vmRepo.findById(vmIdDecision.vmId);
        if (!vm) {
            return { allowed: false, response: createResponse(404, "VM not found") };
        }

        if (!input.isSuperAdmin && vm.owner !== input.user._id?.toString()) {
            return { allowed: false, response: createResponse(403, "You don't have permission to access this VM") };
        }

        return { allowed: true, vm, vmId: vmIdDecision.vmId };
    }

    private simplifyNetworkInterfaces(interfacesData: NetworkInterfacesResponse | NetworkInterface[]): SimplifiedNetworkInterface[] {
        let interfaces: NetworkInterface[];

        if (Array.isArray(interfacesData)) {
            interfaces = interfacesData;
        } else if (interfacesData && "result" in interfacesData && Array.isArray(interfacesData.result)) {
            interfaces = interfacesData.result;
        } else {
            logger.warn("Invalid network interfaces data format:", interfacesData);
            return [];
        }

        if (!interfaces || !Array.isArray(interfaces)) {
            return [];
        }

        return interfaces.map((iface: NetworkInterface) => {
            const ipv4Addresses: string[] = [];
            if (iface["ip-addresses"] && Array.isArray(iface["ip-addresses"])) {
                iface["ip-addresses"].forEach((ip: NetworkIPAddress) => {
                    if (ip["ip-address"] && ip["ip-address-type"] === "ipv4" && !ip["ip-address"].startsWith("127.")) {
                        ipv4Addresses.push(ip["ip-address"]);
                    }
                });
            }

            return {
                name: iface.name || "unknown",
                macAddress: iface["hardware-address"] || "unknown",
                ipAddresses: ipv4Addresses
            };
        }).filter((iface: SimplifiedNetworkInterface) =>
            iface.name !== "lo" && iface.name !== "unknown" && iface.macAddress !== "unknown"
        );
    }
}

export const vmReadService = new VMReadService();
