import { Service } from "../abstract/Service";
import { resp, createResponse } from "../utils/resp";
import { PVEResp } from "../interfaces/Response/PVEResp";
import { Request } from "express";
import { validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { pve_api } from "../enum/PVE_API";
import { callWithUnauthorized } from "../utils/fetch";
import { VMModel } from "../orm/schemas/VM/VMSchemas";
import { User } from "../interfaces/User";
import { VMDetailedConfig, VMDetailWithConfig, VMBasicConfig, VMDetailWithBasicConfig } from "../interfaces/VM/VM";
import { VMUtils } from "../utils/VMUtils";
import { PVEUtils } from "../utils/PVEUtils";
import { PVE_API_USERMODE_TOKEN, PVE_API_ADMINMODE_TOKEN, PVE_API_SUPERADMINMODE_TOKEN } from "../utils/VMUtils";
import { logger } from "../middlewares/log";
import Roles from "../enum/role";


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

            // 為每個 VM 獲取基本狀態資訊和實時狀態
            const vmDetails: VMDetailWithBasicConfig[] = await Promise.all(
                vms.map(async (vm): Promise<VMDetailWithBasicConfig> => {
                    try {
                        // 獲取基本配置
                        const basicConfig = await this._getBasicQemuConfig(vm.pve_node, vm.pve_vmid);
                        
                        // 獲取實時狀態
                        const vmStatus = await VMUtils.getVMStatus(vm.pve_node, vm.pve_vmid);
                        
                        // 如果 VM 是開機狀態，嘗試獲取網路信息
                        let networkInfo = null;
                        if (vmStatus && vmStatus.status === 'running') {
                            const networkResult = await VMUtils.getVMNetworkInfo(vm.pve_node, vm.pve_vmid);
                            if (networkResult.success && networkResult.interfaces) {
                                const ipAddresses = VMUtils.extractIPAddresses(networkResult.interfaces);
                                networkInfo = {
                                    ip_addresses: ipAddresses,
                                    interfaces: networkResult.interfaces
                                };
                            }
                        }
                        
                        return {
                            _id: vm._id,
                            pve_vmid: vm.pve_vmid,
                            pve_node: vm.pve_node,
                            config: basicConfig.code === 200 ? (basicConfig.body || null) : null,
                            status: vmStatus ? {
                                current_status: vmStatus.status,
                                uptime: vmStatus.uptime
                            } : null,
                            network: networkInfo,
                            error: basicConfig.code !== 200 ? basicConfig.message : null
                        };
                    } catch (error) {
                        return {
                            _id: vm._id,
                            pve_vmid: vm.pve_vmid,
                            pve_node: vm.pve_node,
                            config: null,
                            status: null,
                            network: null,
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
    public async getAllVMs(Request: Request): Promise<resp<VMDetailWithConfig[] | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<User>(Request);
            if (error) {
                console.error("Error validating token:", error);
                return createResponse(error.code, error.message);
            }

            // 獲取所有 VM 的詳細資訊
            const vms = await VMModel.find({}).exec();

            // 為每個 VM 獲取詳細狀態資訊和實時狀態
            const vmDetails: VMDetailWithConfig[] = await Promise.all(
                vms.map(async (vm): Promise<VMDetailWithConfig> => {
                    try {
                        // 獲取詳細配置
                        const detailedConfig = await this._getDetailedQemuConfig(vm.pve_node, vm.pve_vmid);
                        
                        // 獲取實時狀態
                        const vmStatus = await VMUtils.getVMStatus(vm.pve_node, vm.pve_vmid);
                        
                        // 如果 VM 是開機狀態，嘗試獲取網路信息
                        let networkInfo = null;
                        if (vmStatus && vmStatus.status === 'running') {
                            const networkResult = await VMUtils.getVMNetworkInfo(vm.pve_node, vm.pve_vmid);
                            if (networkResult.success && networkResult.interfaces) {
                                const ipAddresses = VMUtils.extractIPAddresses(networkResult.interfaces);
                                networkInfo = {
                                    ip_addresses: ipAddresses,
                                    interfaces: networkResult.interfaces
                                };
                            }
                        }
                        
                        return {
                            _id: vm._id,
                            pve_vmid: vm.pve_vmid,
                            pve_node: vm.pve_node,
                            owner: vm.owner,
                            config: detailedConfig.code === 200 ? (detailedConfig.body || null) : null,
                            status: vmStatus ? {
                                current_status: vmStatus.status,
                                uptime: vmStatus.uptime
                            } : null,
                            network: networkInfo,
                            error: detailedConfig.code !== 200 ? detailedConfig.message : null
                        };
                    } catch (error) {
                        return {
                            _id: vm._id,
                            pve_vmid: vm.pve_vmid,
                            pve_node: vm.pve_node,
                            owner: vm.owner,
                            config: null,
                            status: null,
                            network: null,
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

            return createResponse(200, "VM status retrieved successfully", {
                status: result.status,
                uptime: result.uptime
            });

        } catch (error) {
            logger.error("Error in getVMStatus:", error);
            return createResponse(500, "Internal server error");
        }
    }

    // 私有輔助方法 - 獲取基本 QEMU 配置
    private async _getBasicQemuConfig(node: string, vmid: string): Promise<resp<VMBasicConfig | undefined>> {
        return await VMUtils.getBasicQemuConfig(node, vmid);
    }

    // 私有輔助方法 - 獲取詳細 QEMU 配置
    private async _getDetailedQemuConfig(node: string, vmid: string): Promise<resp<VMDetailedConfig | undefined>> {
        try {
            const qemuConfig: PVEResp = await callWithUnauthorized('GET', pve_api.nodes_qemu_config(node, vmid), undefined, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_ADMINMODE_TOKEN}`
                }
            });

            if (!qemuConfig || !qemuConfig.data) {
                return createResponse(404, "QEMU config not found");
            }

            // 返回詳細資訊但不包含敏感資訊
            const detailedConfig: VMDetailedConfig = {
                vmid: qemuConfig.data.vmid,
                name: qemuConfig.data.name,
                cores: qemuConfig.data.cores,
                memory: qemuConfig.data.memory,
                node: node,
                status: qemuConfig.data.status || 'stopped',
                scsi0: qemuConfig.data.scsi0,
                net0: qemuConfig.data.net0,
                bootdisk: qemuConfig.data.bootdisk,
                ostype: qemuConfig.data.ostype,
                disk_size: PVEUtils.extractDiskSizeFromConfig(qemuConfig.data.scsi0)
            };

            return createResponse(200, "Detailed QEMU config fetched successfully", detailedConfig);
        } catch (error) {
            console.error("Error in _getDetailedQemuConfig:", error);
            return createResponse(500, "Internal Server Error");
        }
    }
}