import { Service } from "../abstract/Service";
import { resp, createResponse } from "../utils/resp";
import { PVEResp } from "../interfaces/Response/PVEResp";
import { Request } from "express";
import { validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { pve_api } from "../enum/PVE_API";
import { callWithUnauthorized } from "../utils/fetch";
import { VMModel, VMSchema } from "../orm/schemas/VM/VMSchemas";
import { User } from "../interfaces/User";
import { VMDetailedConfig, VMDetailWithConfig, VMBasicConfig, VMDetailWithBasicConfig, NetworkIPAddress, NetworkInterface, NetworkInterfacesResponse, SimplifiedNetworkInterface, NetworkStatistics } from "../interfaces/VM/VM";
import { VMUtils } from "../utils/VMUtils";
import { PVEUtils } from "../utils/PVEUtils";
import { PVE_API_USERMODE_TOKEN, PVE_API_ADMINMODE_TOKEN, PVE_API_SUPERADMINMODE_TOKEN } from "../utils/VMUtils";
import { logger } from "../middlewares/log";
import Roles from "../enum/role";
import { UsersModel } from "../orm/schemas/UserSchemas";

export class VMService extends Service {

    // 獲取用戶擁有的 VM 列表
    public async getUserOwnedVMs(Request: Request): Promise<resp<VMDetailWithBasicConfig[] | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                console.error("Error validating token:", error);
                return createResponse(error.code, error.message);
            }

            if (!user.owned_vms || user.owned_vms.length === 0) {
                return createResponse(200, "No VMs found for user", []);
            }

            // 獲取用戶擁有的 VM 詳細資訊
            const vms = await VMModel.find({ 
                _id: { $in: user.owned_vms } 
            }).exec();

            // 為每個 VM 獲取基本狀態資訊
            const vmDetails: VMDetailWithBasicConfig[] = await Promise.all(
                vms.map(async (vm): Promise<VMDetailWithBasicConfig> => {
                    try {
                        // 獲取基本配置
                        const basicConfig = await this._getBasicQemuConfig(vm.pve_node, vm.pve_vmid);
                        
                        // 獲取實時狀態
                        const vmStatus = await VMUtils.getVMStatus(vm.pve_node, vm.pve_vmid);
                        
                        return {
                            _id: vm._id,
                            pve_vmid: vm.pve_vmid,
                            pve_node: vm.pve_node,
                            status: vmStatus ? {
                                current_status: vmStatus.status,
                                uptime: vmStatus.uptime
                            } : null,
                            error: basicConfig.code !== 200 ? basicConfig.message : null
                        };
                    } catch (error) {
                        return {
                            _id: vm._id,
                            pve_vmid: vm.pve_vmid,
                            pve_node: vm.pve_node,
                            owner: vm.owner,
                            config: null,
                            status: null,
                            error: "Failed to fetch VM config or status"
                        };
                    }
                })
            );

            return createResponse(200, "User VMs fetched successfully", vmDetails);
        } catch (error) {
            console.error("Error in getUserOwnedVMs:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // superadmin get all vms
    public async getAllVMs(Request: Request): Promise<resp<VMDetailWithBasicConfig[] | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<User>(Request);
            if (error) {
                console.error("Error validating token:", error);
                return createResponse(error.code, error.message);
            }

            // 獲取所有 VM 的詳細資訊
            const vms = await VMModel.find({}).exec();

            // 為每個 VM 獲取基本狀態資訊
            const vmDetails: VMDetailWithBasicConfig[] = await Promise.all(
                vms.map(async (vm): Promise<VMDetailWithBasicConfig> => {
                    try {
                        // 獲取基本配置
                        const basicConfig = await this._getBasicQemuConfig(vm.pve_node, vm.pve_vmid);
                        
                        // 獲取實時狀態
                        const vmStatus = await VMUtils.getVMStatus(vm.pve_node, vm.pve_vmid);
                        
                        return {
                            _id: vm._id,
                            pve_vmid: vm.pve_vmid,
                            pve_node: vm.pve_node,
                            owner: (await UsersModel.findById(vm.owner).exec())?.username || "Unknown",
                            status: vmStatus ? {
                                current_status: vmStatus.status,
                                uptime: vmStatus.uptime
                            } : null,
                            error: basicConfig.code !== 200 ? basicConfig.message : null
                        };
                    } catch (error) {
                        return {
                            _id: vm._id,
                            pve_vmid: vm.pve_vmid,
                            pve_node: vm.pve_node,
                            owner: vm.owner,
                            config: null,
                            status: null,
                            error: "Failed to fetch VM config or status"
                        };
                    }
                })
            );

            return createResponse(200, "All VMs fetched successfully", vmDetails);
        } catch (error) {
            console.error("Error in getAllVMs:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // 獲取 VM 當前狀態
    public async getVMStatus(Request: Request): Promise<resp<{ status: string, uptime?: number } | undefined>> {
        try {
            // 首先嘗試驗證為 superadmin
            const { user: superAdminUser, error: superAdminError } = await validateTokenAndGetSuperAdminUser<User>(Request);
            let user: User;
            let isSuperAdmin = false;

            if (!superAdminError && superAdminUser && superAdminUser.role === Roles.SuperAdmin) {
                user = superAdminUser;
                isSuperAdmin = true;
            } else {
                // 如果不是 superadmin，則驗證為普通用戶
                const { user: normalUser, error } = await validateTokenAndGetUser<User>(Request);
                if (error) {
                    console.error("Error validating token:", error);
                    return createResponse(error.code, error.message);
                }
                user = normalUser;
            }

            const { vm_id } = Request.query;
            if (!vm_id) {
                return createResponse(400, "VM ID is required");
            }

            // 檢查 VM 是否存在
            const vm = await VMModel.findOne({ _id: vm_id });
            if (!vm) {
                return createResponse(404, "VM not found");
            }

            // 權限檢查：superadmin 可以檢視任何機器，普通用戶只能檢視自己的
            if (!isSuperAdmin && vm.owner !== user._id?.toString()) {
                return createResponse(403, "You don't have permission to access this VM");
            }

            // 獲取 VM 狀態
            const result = await VMUtils.getVMStatus(vm.pve_node, vm.pve_vmid);
            if (!result) {
                return createResponse(500, "Failed to get VM status");
            }

            // 準備返回數據
            let responseData: {
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

            // 如果 VM 正在運行，獲取資源使用情況
            if (result.status === 'running') {
                try {
                    // 獲取資源使用情況（CPU、記憶體）
                    const resourceUsage = await VMUtils.getVMResourceUsage(vm.pve_node, vm.pve_vmid);
                    if (resourceUsage.success) {
                        responseData.resourceUsage = {
                            cpu: resourceUsage.cpu ?? 0, // CPU 使用百分比
                            memory: resourceUsage.memory ?? 0 // 記憶體使用量 (GB)
                        };
                    }
                } catch (error) {
                    logger.warn(`Failed to get resource usage for ${vm.pve_vmid}:`, error);
                    // 繼續返回基本狀態資訊，即使獲取資源使用失敗
                }
            }

            return createResponse(200, "VM status retrieved successfully", responseData);

        } catch (error) {
            logger.error("Error in getVMStatus:", error);
            return createResponse(500, "Internal server error");
        }
    }

    /**
     * 獲取 VM 網路資訊
     */
    public async getVMNetworkInfo(Request: Request): Promise<resp<{ interfaces: SimplifiedNetworkInterface[] } | undefined>> {
        try {
            // 首先嘗試驗證為 superadmin
            const { user: superAdminUser, error: superAdminError } = await validateTokenAndGetSuperAdminUser<User>(Request);
            let user: User;
            let isSuperAdmin = false;

            if (!superAdminError && superAdminUser && superAdminUser.role === Roles.SuperAdmin) {
                user = superAdminUser;
                isSuperAdmin = true;
            } else {
                // 如果不是 superadmin，則驗證為普通用戶
                const { user: normalUser, error } = await validateTokenAndGetUser<User>(Request);
                if (error) {
                    console.error("Error validating token:", error);
                    return createResponse(error.code, error.message);
                }
                user = normalUser;
            }

            const { vm_id } = Request.query;
            if (!vm_id) {
                return createResponse(400, "VM ID is required");
            }

            // 檢查 VM 是否存在
            const vm = await VMModel.findOne({ _id: vm_id });
            if (!vm) {
                return createResponse(404, "VM not found");
            }

            // 權限檢查：superadmin 可以檢視任何機器，普通用戶只能檢視自己的
            if (!isSuperAdmin && vm.owner !== user._id?.toString()) {
                return createResponse(403, "You don't have permission to access this VM");
            }

            // 檢查 VM 狀態，只有運行中的 VM 才能獲取網路資訊
            const statusResult = await VMUtils.getVMStatus(vm.pve_node, vm.pve_vmid);
            if (!statusResult) {
                return createResponse(500, "Failed to get VM status");
            }

            if (statusResult.status !== 'running') {
                return createResponse(400, "VM must be running to get network information");
            }

            // 獲取網路介面和 IP 地址資訊
            const networkInfo = await VMUtils.getVMNetworkInfo(vm.pve_node, vm.pve_vmid);
            if (!networkInfo.success) {
                return createResponse(500, networkInfo.errorMessage || "Failed to get network information");
            }

            // 調試：輸出原始網路數據
            logger.info('Raw network info:', JSON.stringify(networkInfo.interfaces, null, 2));

            // 簡化網路資訊，只保留介面名稱、MAC 地址和 IP 地址
            const simplifiedInterfaces = this._simplifyNetworkInterfaces(networkInfo.interfaces || []);
            
            // 調試：輸出簡化後的數據
            logger.info('Simplified interfaces:', JSON.stringify(simplifiedInterfaces, null, 2));
            
            return createResponse(200, "VM network information retrieved successfully", {
                interfaces: simplifiedInterfaces
            });

        } catch (error) {
            logger.error("Error in getVMNetworkInfo:", error);
            return createResponse(500, "Internal server error");
        }
    }

    // 私有輔助方法 - 獲取基本 QEMU 配置
    private async _getBasicQemuConfig(node: string, vmid: string): Promise<resp<VMBasicConfig | undefined>> {
        return await VMUtils.getBasicQemuConfig(node, vmid);
    }

    /**
     * 簡化網路介面資訊，只保留介面名稱、MAC 地址和 IP 地址
     */
    private _simplifyNetworkInterfaces(interfacesData: NetworkInterfacesResponse | NetworkInterface[]): SimplifiedNetworkInterface[] {
        let interfaces: NetworkInterface[];
        
        // 處理不同的數據格式
        if (Array.isArray(interfacesData)) {
            interfaces = interfacesData;
        } else if (interfacesData && 'result' in interfacesData && Array.isArray(interfacesData.result)) {
            interfaces = interfacesData.result;
        } else {
            console.warn('Invalid network interfaces data format:', interfacesData);
            return [];
        }

        if (!interfaces || !Array.isArray(interfaces)) {
            return [];
        }

        return interfaces.map((iface: NetworkInterface) => {
            // 提取 IPv4 地址
            const ipv4Addresses: string[] = [];
            if (iface['ip-addresses'] && Array.isArray(iface['ip-addresses'])) {
                iface['ip-addresses'].forEach((ip: NetworkIPAddress) => {
                    if (ip['ip-address'] && ip['ip-address-type'] === 'ipv4') {
                        // 排除回環地址
                        if (!ip['ip-address'].startsWith('127.')) {
                            ipv4Addresses.push(ip['ip-address']);
                        }
                    }
                });
            }

            return {
                name: iface.name || 'unknown',
                macAddress: iface['hardware-address'] || 'unknown',
                ipAddresses: ipv4Addresses
            };
        }).filter((iface: SimplifiedNetworkInterface) => 
            // 過濾掉回環介面和無效介面
            iface.name !== 'lo' && iface.name !== 'unknown' && iface.macAddress !== 'unknown'
        );
    }
}