import { Service } from "../abstract/Service";
import { resp, createResponse } from "../utils/resp";
import { PVEResp } from "../interfaces/Response/PVEResp";
import { Request } from "express";
import { getTokenRole, validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { pve_api } from "../enum/PVE_API";
import { callWithUnauthorized } from "../utils/fetch";
import { PVE_qemu_config, PVE_Task_Status_Response, PVE_Task_Status, PVE_Task_ExitStatus, PVE_TASK_STATUS, PVE_TASK_EXIT_STATUS } from "../interfaces/PVE";
import { VMTemplateModel } from "../orm/schemas/VM/VMTemplateSchemas";
import { VM_Template_Info, VM_Template } from "../interfaces/VM/VM_Template";
import { UsersModel } from "../orm/schemas/UserSchemas";
import { VM_TaskModel } from "../orm/schemas/VM/VM_TaskSchemas";
import { VM_Task, VM_Task_Status, VM_Task_Update, VM_Task_Step_Update, VM_Task_With_PVE_Status, VM_Task_Query, VM_Task_Query_With_Pagination } from "../interfaces/VM/VM_Task";
import { VMModel } from "../orm/schemas/VM/VMSchemas";
import { ComputeResourcePlanModel } from "../orm/schemas/ComputeResourcePlanSchemas";
import { UsedComputeResourceModel } from "../orm/schemas/UsedComputeResourceSchemas";
import { User } from "../interfaces/User";
import {logger} from "../middlewares/log";
import { VMConfig, VMDetailedConfig, VMDetailWithConfig, VMBasicConfig, VMDetailWithBasicConfig, VMCreationParams } from "../interfaces/VM/VM";
import { VMDeletionResponse, VMDeletionUserValidation } from "../interfaces/Response/VMResp";
import { DeleteResult, UpdateResult } from "mongodb";
import { PVEUtils } from "../utils/PVEUtils";

const PVE_API_USERMODE_TOKEN = process.env.PVE_API_USERMODE_TOKEN;
const PVE_API_ADMINMODE_TOKEN = process.env.PVE_API_ADMINMODE_TOKEN;
const PVE_API_SUPERADMINMODE_TOKEN = process.env.PVE_API_SUPERADMINMODE_TOKEN;

export class VMService extends Service {

    private readonly VM_CREATION_STEP_INDICES = {
        CLONE: 0,
        CPU: 1,
        MEMORY: 2,
        DISK: 3,
        CLOUD_INIT: 4
    };

    // 創建 VM 從範本
    public async createVMFromTemplate(Request: Request): Promise<resp<PVEResp | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                logger.error("Error validating token for createVMFromTemplate:", error);
                return createResponse(error.code, error.message);
            }

            const { template_id, name, target, storage = "NFS", full = '1', cpuCores, memorySize, diskSize, ciuser: requestCiuser, cipassword: requestCipassword } = Request.body;
            
            logger.info(`User ${user.username} (${user._id}) starting VM creation from template ${template_id}`);

            const validationResult = await this._validateVMCreationParams({ template_id, name, target, cpuCores, memorySize, diskSize, ciuser: requestCiuser, cipassword: requestCipassword });
            if (validationResult.code !== 200) {
                logger.warn(`VM creation validation failed for user ${user.username}: ${validationResult.message}`);
                return validationResult;
            }

            const nextIdResult = await this._getNextVMId();
            if (nextIdResult.code !== 200 || !nextIdResult.body) {
                logger.error(`Failed to get next VM ID for user ${user.username}: ${nextIdResult.message}`);
                return nextIdResult;
            }
            const nextId = nextIdResult.body.data;

            // 清理 VM 名稱
            const sanitizedName = PVEUtils.sanitizeVMName(name);
            if (!sanitizedName) {
                logger.warn(`Invalid VM name provided by user ${user.username}: ${name}`);
                return createResponse(400, "Invalid VM name. Name must contain only alphanumeric characters, hyphens, and dots, and cannot start or end with a hyphen.");
            }

            // 獲取範本資訊
            const templateResult = await this._getTemplateDetails(template_id);
            if (templateResult.code !== 200 || !templateResult.body) {
                logger.error(`Failed to get template details for user ${user.username}, template ${template_id}: ${templateResult.message}`);
                return templateResult;
            }
            const { template_info, qemuConfig } = templateResult.body;

            // 檢查範本是否有有效的 ciuser 和 cipassword
            const templateHasValidCiuser = template_info.ciuser && 
                                         typeof template_info.ciuser === 'string' && 
                                         template_info.ciuser.trim() !== '' && 
                                         template_info.ciuser !== 'undefined' &&
                                         template_info.ciuser !== 'null';
            const templateHasValidCipassword = template_info.cipassword && 
                                             typeof template_info.cipassword === 'string' && 
                                             template_info.cipassword.trim() !== '' && 
                                             template_info.cipassword !== 'undefined' &&
                                             template_info.cipassword !== 'null';

            // 使用範本的預設 ciuser 和 cipassword，除非 request body 有明確提供
            const ciuser = requestCiuser !== undefined ? requestCiuser : (templateHasValidCiuser ? template_info.ciuser! : '');
            const cipassword = requestCipassword !== undefined ? requestCipassword : (templateHasValidCipassword ? template_info.cipassword! : '');
            
            logger.info(`Template has valid ciuser: ${templateHasValidCiuser}, cipassword: ${templateHasValidCipassword}`);
            logger.info(`Final ciuser: "${ciuser}", cipassword: "${cipassword ? '[PROVIDED]' : '[NOT PROVIDED]'}", from template: ${requestCiuser === undefined && templateHasValidCiuser}`);

            // 檢查資源限制
            const resourceCheckResult = await this._checkResourceLimits(user, cpuCores, memorySize, diskSize);
            if (resourceCheckResult.code !== 200) {
                logger.warn(`Resource limits exceeded for user ${user.username}: CPU=${cpuCores}, Memory=${memorySize}MB, Disk=${diskSize}GB`);
                return resourceCheckResult;
            }

            // 創建任務前清理用戶的舊任務
            await this._cleanupUserOldTasks(user._id.toString(), 20); // 每個用戶最多保留20個任務

            const task = await this._createVMTask(template_id, user._id.toString(), nextId, template_info.pve_vmid, target);
            logger.info(`Created VM task ${task.task_id} for user ${user.username}, VM ID: ${nextId}`);

            const cloneResult = await this._cloneVM(template_info.pve_node, template_info.pve_vmid, nextId, sanitizedName, target, storage, full);
            
            await this._updateTaskStatus(task.task_id, cloneResult.success ? VM_Task_Status.IN_PROGRESS : VM_Task_Status.FAILED, cloneResult.upid, cloneResult.errorMessage);

            if (!cloneResult.success) {
                logger.error(`VM clone failed for user ${user.username}, task ${task.task_id}: ${cloneResult.errorMessage}`);
                return createResponse(500, "Failed to clone VM from template");
            }

            const configResult = await this._configureAndFinalizeVM(target, nextId, cpuCores, memorySize, diskSize, cloneResult.upid!, template_info.pve_node, task.task_id, ciuser, cipassword);
            
            if (configResult.success) {
                // 只有在所有操作都成功後才更新資源使用量和用戶 VM 列表
                await this._updateUsedComputeResources(user._id.toString(), cpuCores, memorySize, diskSize);
                const vmTableId = await this._updateUserOwnedVMs(user._id.toString(), nextId, target);
                await this._updateTaskStatus(task.task_id, VM_Task_Status.COMPLETED, cloneResult.upid);
                
                logger.info(`VM ${nextId} created successfully for user ${user.username}, task ${task.task_id}`);
                
                return createResponse(200, "VM created and configured successfully", {
                    task_id: task.task_id,
                    vm_name: sanitizedName,
                    vmid: nextId
                });
            } else {
                // 配置失敗，需要清理
                await this._updateTaskStatus(task.task_id, VM_Task_Status.FAILED, cloneResult.upid, configResult.errorMessage);
                
                logger.error(`VM configuration failed for user ${user.username}, task ${task.task_id}: ${configResult.errorMessage}`);
                
                // 清理失敗的 VM 和資源 - 強制清理
                try {
                    await this._cleanupFailedVMCreation(user._id.toString(), nextId, target, task.task_id);
                    logger.info(`Successfully cleaned up failed VM ${nextId} for user ${user.username}`);
                } catch (cleanupError) {
                    logger.error(`Error during cleanup of failed VM ${nextId}:`, cleanupError);
                }
                
                return createResponse(500, "VM created but configuration failed, resources have been cleaned up");
            }
        } catch (error) {
            logger.error("Error in createVMFromTemplate:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // 刪除用戶擁有的 VM
    public async deleteUserVM(Request: Request): Promise<resp<VMDeletionResponse | undefined>> {
        try {
            const tokenRoleResult = await getTokenRole(Request);
            const token_role = tokenRoleResult.role;
            
            if (!token_role) {
                return createResponse(401, "Unable to determine user role");
            }
            
            // 根據角色驗證用戶並獲取正確的用戶類型
            const userValidation: VMDeletionUserValidation = await this._validateUserForVMDeletion(Request, token_role);
            
            if (userValidation.error) {
                return userValidation.error;
            }

            const user = userValidation.user;
            if (!user || !user._id) {
                return createResponse(401, "User not found or invalid");
            }

            const { vm_id } = Request.body;
            console.log(`[deleteUserVM] vm_id from request: ${vm_id}`);
            if (!vm_id || typeof vm_id !== 'string') {
                return createResponse(400, "vm_id is required and must be a string");
            }

            // 檢查 VM 是否屬於該用戶（superadmin 可以刪除任何 VM）
            if (token_role !== 'superadmin' && !user.owned_vms.includes(vm_id)) {
                return createResponse(403, "Access denied: VM not owned by user");
            }

            // 獲取 VM 資訊
            const vm = await VMModel.findById(vm_id).exec();
            if (!vm) {
                return createResponse(404, "VM not found");
            }

            // 在刪除 VM 之前，先獲取其配置用於資源回收
            let vmConfig: VMConfig | null = null;
            try {
                vmConfig = await this._getCurrentVMConfig(vm.pve_node, vm.pve_vmid);
                if (vmConfig) {
                    console.log(`[deleteUserVM] Retrieved VM config for resource reclaim: cores=${vmConfig.cores}, memory=${vmConfig.memory}, disk size=${PVEUtils.extractDiskSizeFromConfig(vmConfig.scsi0)}GB`);
                }
            } catch (configError) {
                logger.warn(`[deleteUserVM] Failed to get VM config for resource reclaim: ${configError}`);
                // 繼續執行刪除流程，但無法進行資源回收
            }

            try {
                // 嘗試從 PVE 刪除 VM
                console.log(`[deleteUserVM] Attempting to delete VM from PVE: node=${vm.pve_node}, vmid=${vm.pve_vmid}`);
                let deleteResp: PVEResp | undefined;
                
                try {
                    deleteResp = await callWithUnauthorized('DELETE', pve_api.nodes_qemu_vm(vm.pve_node, vm.pve_vmid), undefined, {
                        headers: {
                            'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                        }
                    });
                    console.log(`[deleteUserVM] PVE delete response: ${JSON.stringify(deleteResp, null, 2)}`);
                } catch (apiError) {
                    console.error(`[deleteUserVM] PVE API call failed:`, apiError);
                    
                    // 檢查是否是 JSON 解析錯誤
                    if (apiError instanceof SyntaxError && apiError.message.includes('JSON')) {
                        return createResponse(500, `PVE API returned invalid JSON response: ${apiError.message}`);
                    }
                    
                    // 其他 API 錯誤
                    return createResponse(500, `PVE API call failed: ${apiError instanceof Error ? apiError.message : 'Unknown error'}`);
                }

                // 檢查刪除操作是否成功
                const deletionResult = await this._processDeletionResponse(deleteResp, vm);
                
                if (!deletionResult.success) {
                    logger.error(`[deleteUserVM] VM deletion failed: ${deletionResult.errorMessage}`);
                    return createResponse(500, deletionResult.errorMessage || "VM deletion failed");
                }

                // 回收資源 - 使用之前獲取的配置
                if (vmConfig) {
                    try {
                        await this._reclaimVMResourcesWithConfig(user._id.toString(), vmConfig);
                        logger.info(`[deleteUserVM] Successfully reclaimed resources for user ${user._id}`);
                    } catch (resourceError) {
                        logger.error(`[deleteUserVM] Error reclaiming resources for user ${user._id}:`, resourceError);
                        // 不影響刪除流程，繼續執行
                    }
                } else {
                    logger.warn(`[deleteUserVM] No VM config available for resource reclaim`);
                }

                // 確認 VM 已被刪除後才清理資料庫
                console.log(`[deleteUserVM] Deletion success, cleaning up database for vm_id: ${vm_id}`);
                
                // 清理資料庫記錄 - 跳過資源回收因為已經在上面做過了
                await this._cleanupVMFromDatabase(user._id.toString(), vm_id, vmConfig, true);
                console.log(`[deleteUserVM] _cleanupVMFromDatabase called for user: ${user._id}, vm_id: ${vm_id}`);

                const response: VMDeletionResponse = {
                    vm_id: vm_id,
                    pve_vmid: vm.pve_vmid,
                    pve_node: vm.pve_node,
                    message: "VM deleted successfully"
                };

                if (deletionResult.taskId) {
                    response.task_id = deletionResult.taskId;
                    response.message = "VM deletion task completed successfully";
                } else {
                    console.log("[deleteUserVM] VM deletion completed without taskId");
                }

                return createResponse(200, "VM deletion completed successfully", response);

            } catch (deleteError) {
                logger.error(`[deleteUserVM] Error deleting VM from PVE: ${deleteError}`);
                
                const errorResponse: VMDeletionResponse = {
                    vm_id: vm_id,
                    pve_vmid: vm.pve_vmid,
                    pve_node: vm.pve_node,
                    message: (deleteError as Error).message || "Unknown error"
                };
                
                return createResponse(500, "Failed to delete VM from PVE", errorResponse);
            }
        } catch (error) {
            return createResponse(500, "Internal Server Error");
        }
    }

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
                        const basicConfig = await this._getBasicQemuConfig(vm.pve_node, vm.pve_vmid);
                        return {
                            _id: vm._id,
                            pve_vmid: vm.pve_vmid,
                            pve_node: vm.pve_node,
                            config: basicConfig.code === 200 ? (basicConfig.body || null) : null,
                            error: basicConfig.code !== 200 ? basicConfig.message : null
                        };
                    } catch (error) {
                        return {
                            _id: vm._id,
                            pve_vmid: vm.pve_vmid,
                            pve_node: vm.pve_node,
                            config: null,
                            error: "Failed to fetch VM config"
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

            // 為每個 VM 獲取詳細狀態資訊
            const vmDetails: VMDetailWithConfig[] = await Promise.all(
                vms.map(async (vm): Promise<VMDetailWithConfig> => {
                    try {
                        const detailedConfig = await this._getDetailedQemuConfig(vm.pve_node, vm.pve_vmid);
                        return {
                            _id: vm._id,
                            pve_vmid: vm.pve_vmid,
                            pve_node: vm.pve_node,
                            owner: vm.owner,
                            config: detailedConfig.code === 200 ? (detailedConfig.body || null) : null,
                            error: detailedConfig.code !== 200 ? detailedConfig.message : null
                        };
                    } catch (error) {
                        return {
                            _id: vm._id,
                            pve_vmid: vm.pve_vmid,
                            pve_node: vm.pve_node,
                            owner: vm.owner,
                            config: null,
                            error: "Failed to fetch VM config"
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

    // 私有輔助方法 - 獲取基本 QEMU 配置
    private async _getBasicQemuConfig(node: string, vmid: string): Promise<resp<VMBasicConfig | undefined>> {
        try {
            const qemuConfig: PVEResp = await callWithUnauthorized('GET', pve_api.nodes_qemu_config(node, vmid), undefined, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_USERMODE_TOKEN}`
                }
            });

            if (!qemuConfig || !qemuConfig.data) {
                return createResponse(404, "QEMU config not found");
            }

            // 只返回基本資訊：CPU、記憶體、磁碟
            const basicConfig: VMBasicConfig = {
                vmid: qemuConfig.data.vmid,
                name: qemuConfig.data.name,
                cores: qemuConfig.data.cores,
                memory: qemuConfig.data.memory,
                node: node,
                status: qemuConfig.data.status || 'stopped',
                // 只返回磁碟大小資訊，不包含詳細路徑
                disk_size: PVEUtils.extractDiskSizeFromConfig(qemuConfig.data.scsi0)
            };

            return createResponse(200, "Basic QEMU config fetched successfully", basicConfig);
        } catch (error) {
            console.error("Error in _getBasicQemuConfig:", error);
            return createResponse(500, "Internal Server Error");
        }
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

    // 私有輔助方法 - 這些方法需要從 PVEService 移動過來
    private async _validateVMCreationParams(params: VMCreationParams): Promise<resp<string | undefined>> {
        const { template_id, name, target, cpuCores, memorySize, diskSize, ciuser, cipassword } = params;

        const missingFields = [];
        if (!template_id) missingFields.push("template_id");
        if (!name) missingFields.push("name");
        if (!target) missingFields.push("target");
        if (!cpuCores) missingFields.push("cpuCores");
        if (!memorySize) missingFields.push("memorySize");
        if (!diskSize) missingFields.push("diskSize");

        if (missingFields.length > 0) {
            return createResponse(400, `Missing required fields: ${missingFields.join(", ")}`);
        }

        // 檢查 ci user 和 ci password 是否同時存在（如果提供的話）
        if ((ciuser && !cipassword) || (!ciuser && cipassword)) {
            return createResponse(400, "Both ciuser and cipassword must be provided together if specified");
        }

        return createResponse(200, "Validation passed");
    }

    private async _getNextVMId(): Promise<resp<PVEResp | undefined>> {
        try {
            const nextId: PVEResp = await callWithUnauthorized('GET', pve_api.cluster_next_id, undefined, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_USERMODE_TOKEN}`
                }
            });
            return createResponse(200, "Next ID fetched successfully", nextId);
        } catch (error) {
            console.error("Error in _getNextVMId:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    private async _getTemplateDetails(templateId: string): Promise<resp<{ template_info: VM_Template, qemuConfig: PVE_qemu_config } | undefined>> {
        const template_info = await VMTemplateModel.findOne({ _id: templateId }).exec();
        if (!template_info) {
            return createResponse(404, "Template not found");
        }

        // 記錄範本的 ciuser 和 cipassword 值以便調試
        logger.info(`Template ${templateId} - ciuser: "${template_info.ciuser}", cipassword: "${template_info.cipassword ? '[PROVIDED]' : '[NOT PROVIDED]'}"`);
        logger.info(`Template ${templateId} - ciuser type: ${typeof template_info.ciuser}, cipassword type: ${typeof template_info.cipassword}`);

        const qemuConfigResp = await this._getTemplateInfo(template_info.pve_node, template_info.pve_vmid);
        if (qemuConfigResp.code !== 200 || !qemuConfigResp.body) {
            console.error(`Failed to get qemu config for template ${templateId}: ${qemuConfigResp.message}`);
            return createResponse(qemuConfigResp.code, qemuConfigResp.message);
        }

        return createResponse(200, "Template details fetched successfully", {
            template_info,
            qemuConfig: qemuConfigResp.body
        });
    }

    private async _getTemplateInfo(node: string, vmid: string): Promise<resp<PVE_qemu_config | undefined>> {
        try {
            const apiResponse: PVEResp = await callWithUnauthorized('GET', pve_api.nodes_qemu_config(node, vmid), undefined, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_USERMODE_TOKEN}`
                }
            });
            const templateInfo = apiResponse.data as PVE_qemu_config;

            if (!templateInfo) {
                throw new Error(`No qemu config data found in API response for node ${node}, vmid ${vmid}`);
            }

            return createResponse(200, "Template info fetched successfully", templateInfo);
        } catch (error) {
            console.error(`Error in _getTemplateInfo for node ${node}, vmid ${vmid}:`, error);
            return createResponse(500, "Internal Server Error");
        }
    }

    private async _checkResourceLimits(user: User, cpuCores: number, memorySize: number, diskSize: number): Promise<resp<any>> {
        const computeResourcePlan = await ComputeResourcePlanModel.findOne({ _id: user.compute_resource_plan_id }).exec();
        if (!computeResourcePlan) {
            return createResponse(404, "Compute resource plan not found");
        }

        // 檢查 per VM 限制
        if (cpuCores > computeResourcePlan.max_cpu_cores_per_vm ||
            memorySize > computeResourcePlan.max_memory_per_vm ||
            diskSize > computeResourcePlan.max_storage_per_vm) {
            return createResponse(400, "Requested resources exceed the per VM limits of your compute resource plan");
        }

        // 檢查總限制
        let usedResources = null;
        if (user.used_compute_resource_id) {
            usedResources = await UsedComputeResourceModel.findById(user.used_compute_resource_id).exec();
        }
        
        if (!usedResources) {
            // 如果沒有資源使用記錄，則創建一個新的
            usedResources = await UsedComputeResourceModel.create({
                cpu_cores: 0,
                memory: 0,
                storage: 0
            });
            
            // 更新用戶記錄，將資源使用記錄的 ID 存儲到用戶資料表
            await UsersModel.updateOne(
                { _id: user._id },
                { used_compute_resource_id: usedResources._id.toString() }
            );
        }

        if (!usedResources) {
            return createResponse(404, "Used compute resources not found for user");
        }

        const availableCpu = computeResourcePlan.max_cpu_cores_sum - usedResources.cpu_cores;
        const availableMemory = computeResourcePlan.max_memory_sum - usedResources.memory;
        const availableStorage = computeResourcePlan.max_storage_sum - usedResources.storage;

        if (cpuCores > availableCpu || memorySize > availableMemory || diskSize > availableStorage) {
            return createResponse(400, "Requested resources exceed the available limits of your compute resource plan");
        }

        return createResponse(200, "Resource limits check passed");
    }

    // 其他私有方法...

    private async _createVMTask(templateId: string, userId: string, vmid: string, templateVmid: string, targetNode: string): Promise<VM_Task> {
        const task: VM_Task = {
            task_id: `clone-${templateId}-${new Date().getTime()}-${userId}`,
            user_id: userId,
            vmid: vmid,
            template_vmid: templateVmid,
            target_node: targetNode,
            status: VM_Task_Status.PENDING,
            progress: 0,
            created_at: new Date(),
            updated_at: new Date(),
            steps: [
                {
                    step_name: "Clone VM from Template",
                    pve_upid: "PENDING",
                    step_status: VM_Task_Status.PENDING,
                    step_message: "",
                    step_start_time: new Date(),
                    step_end_time: undefined,
                    error_message: ""
                },
                {
                    step_name: "Configure CPU Cores",
                    pve_upid: "PENDING",
                    step_status: VM_Task_Status.PENDING,
                    step_message: "",
                    step_start_time: undefined,
                    step_end_time: undefined,
                    error_message: ""
                },
                {
                    step_name: "Configure Memory",
                    pve_upid: "PENDING",
                    step_status: VM_Task_Status.PENDING,
                    step_message: "",
                    step_start_time: undefined,
                    step_end_time: undefined,
                    error_message: ""
                },
                {
                    step_name: "Resize Disk",
                    pve_upid: "PENDING",
                    step_status: VM_Task_Status.PENDING,
                    step_message: "",
                    step_start_time: undefined,
                    step_end_time: undefined,
                    error_message: ""
                },
                {
                    step_name: "Configure Cloud-Init",
                    pve_upid: "PENDING",
                    step_status: VM_Task_Status.PENDING,
                    step_message: "",
                    step_start_time: undefined,
                    step_end_time: undefined,
                    error_message: ""
                }
            ]
        };

        await VM_TaskModel.create(task);
        return task;
    }

    private async _cloneVM(sourceNode: string, sourceVmid: string, newVmid: string, vmName: string, targetNode: string, storage: string, full: string): Promise<{ success: boolean, upid?: string, errorMessage?: string }> {
        try {
            console.log(`Cloning template ${sourceVmid} from node ${sourceNode} to ${targetNode} with new ID ${newVmid}`);

            // 克隆任務在源節點上執行，通過 target 參數指定目標節點
            const cloneResp: PVEResp = await callWithUnauthorized('POST', pve_api.nodes_qemu_clone(sourceNode, sourceVmid), {
                newid: newVmid,
                name: vmName,
                target: targetNode,  // 指定目標節點
                storage: storage,
                full: full,
            }, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                }
            });

            if (cloneResp && cloneResp.data) {
                logger.info(`Clone operation initiated for VM ${newVmid} with UPID: ${cloneResp.data}`);
                return { success: true, upid: cloneResp.data };
            } else {
                return { success: false, errorMessage: "No UPID returned from clone operation" };
            }
        } catch (error) {
            logger.error(`Error during VM clone operation:`, error);
            return { success: false, errorMessage: error instanceof Error ? error.message : "Unknown error during clone" };
        }
    }

    private async _configureAndFinalizeVM(target_node: string, vmid: string, cpuCores: number, memorySize: number, diskSize: number, cloneUpid: string, sourceNode: string, taskId: string, ciuser: string, cipassword: string): Promise<{ success: boolean, errorMessage?: string }> {
        try {
            // 等待克隆任務完成
            const cloneWaitResult = await this._waitForTaskCompletion(sourceNode, cloneUpid, taskId, this.VM_CREATION_STEP_INDICES.CLONE);
            if (!cloneWaitResult.success) {
                return { success: false, errorMessage: `Clone task failed: ${cloneWaitResult.errorMessage}` };
            }

            // 等待 VM 磁碟準備就緒
            logger.info(`Waiting for VM ${vmid} disk to be ready after clone...`);
            const diskReadyResult = await this._waitForVMDiskReady(target_node, vmid, 20);
            if (!diskReadyResult.success) {
                logger.error(`VM ${vmid} disk not ready: ${diskReadyResult.errorMessage}`);
                return { success: false, errorMessage: diskReadyResult.errorMessage };
            }

            // 配置 CPU 核心數
            const cpuConfigResult = await this._configureVMCPU(target_node, vmid, cpuCores, taskId, this.VM_CREATION_STEP_INDICES.CPU);
            if (!cpuConfigResult.success) {
                return { success: false, errorMessage: `CPU configuration failed: ${cpuConfigResult.errorMessage}` };
            }

            // 配置記憶體
            const memoryConfigResult = await this._configureVMMemory(target_node, vmid, memorySize, taskId, this.VM_CREATION_STEP_INDICES.MEMORY);
            if (!memoryConfigResult.success) {
                return { success: false, errorMessage: `Memory configuration failed: ${memoryConfigResult.errorMessage}` };
            }

            // 調整磁碟大小
            const diskConfigResult = await this._resizeVMDisk(target_node, vmid, diskSize, taskId, this.VM_CREATION_STEP_INDICES.DISK);
            if (!diskConfigResult.success) {
                return { success: false, errorMessage: `Disk resize failed: ${diskConfigResult.errorMessage}` };
            }

            // 配置 Cloud-Init
            const cloudInitResult = await this._configureCloudInit(target_node, vmid, ciuser, cipassword, taskId, this.VM_CREATION_STEP_INDICES.CLOUD_INIT);
            if (!cloudInitResult.success) {
                return { success: false, errorMessage: `Cloud-Init configuration failed: ${cloudInitResult.errorMessage}` };
            }

            return { success: true };
        } catch (error) {
            logger.error(`Error during VM configuration:`, error);
            return { success: false, errorMessage: error instanceof Error ? error.message : "Unknown error during configuration" };
        }
    }

    private async _updateTaskStatus(taskId: string, status: VM_Task_Status, upid?: string, errorMessage?: string): Promise<void> {
        try {
            const updateData: any = {
                status: status,
                updated_at: new Date()
            };

            if (upid) {
                updateData.upid = upid;
            }

            if (errorMessage) {
                updateData.error_message = errorMessage;
            }

            await VM_TaskModel.updateOne({ task_id: taskId }, updateData);
        } catch (error) {
            logger.error(`Error updating task status for ${taskId}:`, error);
        }
    }

    private async _updateUsedComputeResources(userId: string, cpuCores: number, memorySize: number, diskSize: number): Promise<void> {
        try {
            const user = await UsersModel.findById(userId).exec();
            if (!user || !user.used_compute_resource_id) {
                logger.error(`User ${userId} not found or no used compute resource ID`);
                return;
            }

            await UsedComputeResourceModel.updateOne(
                { _id: user.used_compute_resource_id },
                {
                    $inc: {
                        cpu_cores: cpuCores,
                        memory: memorySize,
                        storage: diskSize
                    }
                }
            );
        } catch (error) {
            logger.error(`Error updating used compute resources for user ${userId}:`, error);
        }
    }

    private async _updateUserOwnedVMs(userId: string, pve_vmid: string, pve_node: string): Promise<string> {
        try {
            // 創建新的 VM 記錄
            const newVM = await VMModel.create({
                pve_vmid: pve_vmid,
                pve_node: pve_node,
                owner: userId  // 添加必需的 owner 字段
            });

            // 更新用戶的 owned_vms 列表
            await UsersModel.updateOne(
                { _id: userId },
                { $push: { owned_vms: newVM._id } }
            );

            return newVM._id.toString();
        } catch (error) {
            logger.error(`Error updating user owned VMs for user ${userId}:`, error);
            throw error;
        }
    }

    private async _cleanupFailedVMCreation(userId: string, pve_vmid: string, pve_node: string, taskId: string): Promise<void> {
        try {
            // 嘗試刪除 PVE 上的 VM
            try {
                await callWithUnauthorized('DELETE', pve_api.nodes_qemu_vm(pve_node, pve_vmid), undefined, {
                    headers: {
                        'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                    }
                });
                logger.info(`Successfully deleted VM ${pve_vmid} from PVE node ${pve_node}`);
            } catch (pveError) {
                logger.warn(`Failed to delete VM ${pve_vmid} from PVE: ${pveError}`);
            }

            // 從資料庫中移除 VM 記錄
            const vmRecord = await VMModel.findOne({ pve_vmid: pve_vmid, pve_node: pve_node }).exec();
            if (vmRecord) {
                await VMModel.deleteOne({ _id: vmRecord._id });
                
                // 從用戶的 owned_vms 列表中移除
                await UsersModel.updateOne(
                    { _id: userId },
                    { $pull: { owned_vms: vmRecord._id } }
                );
            }

            // 更新任務狀態
            await this._updateTaskStatus(taskId, VM_Task_Status.FAILED, undefined, "VM creation failed and resources have been cleaned up");
        } catch (error) {
            logger.error(`Error during failed VM cleanup:`, error);
        }
    }

    private async _cleanupUserOldTasks(userId: string, maxTasks: number): Promise<void> {
        try {
            const tasks = await VM_TaskModel.find({ user_id: userId })
                .sort({ created_at: -1 })
                .exec();

            if (tasks.length > maxTasks) {
                const tasksToDelete = tasks.slice(maxTasks);
                const taskIdsToDelete = tasksToDelete.map(task => task.task_id);
                
                await VM_TaskModel.deleteMany({ task_id: { $in: taskIdsToDelete } });
                logger.info(`Cleaned up ${taskIdsToDelete.length} old tasks for user ${userId}`);
            }
        } catch (error) {
            logger.error(`Error cleaning up old tasks for user ${userId}:`, error);
        }
    }

    // 輔助方法 - 等待任務完成
    private async _waitForTaskCompletion(node: string, upid: string, taskId: string, stepIndex: number): Promise<{ success: boolean, errorMessage?: string }> {
        const maxRetries = 300; // 最多等待 5 分鐘
        let retries = 0;

        while (retries < maxRetries) {
            try {
                const taskStatus: PVEResp = await callWithUnauthorized('GET', pve_api.nodes_tasks_status(node, upid), undefined, {
                    headers: {
                        'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                    }
                });

                if (taskStatus && taskStatus.data) {
                    const status = taskStatus.data as PVE_Task_Status_Response;
                    
                    if (status.status === PVE_TASK_STATUS.STOPPED) {
                        if (status.exitstatus === PVE_TASK_EXIT_STATUS.OK) {
                            // 更新步驟狀態
                            await this._updateTaskStep(taskId, stepIndex, VM_Task_Status.COMPLETED, upid);
                            return { success: true };
                        } else {
                            // 任務失敗
                            await this._updateTaskStep(taskId, stepIndex, VM_Task_Status.FAILED, upid, `Task failed with exit status: ${status.exitstatus}`);
                            return { success: false, errorMessage: `Task failed with exit status: ${status.exitstatus}` };
                        }
                    }
                    
                    // 任務仍在運行，等待 1 秒後重試
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    retries++;
                } else {
                    return { success: false, errorMessage: "Failed to get task status" };
                }
            } catch (error) {
                logger.error(`Error checking task status for ${upid}:`, error);
                return { success: false, errorMessage: error instanceof Error ? error.message : "Unknown error" };
            }
        }

        return { success: false, errorMessage: "Task timeout" };
    }

    private async _updateTaskStep(taskId: string, stepIndex: number, status: VM_Task_Status, upid?: string, errorMessage?: string): Promise<void> {
        try {
            const updateQuery: any = {};
            updateQuery[`steps.${stepIndex}.step_status`] = status;
            updateQuery[`steps.${stepIndex}.step_end_time`] = new Date();
            
            if (upid) {
                updateQuery[`steps.${stepIndex}.pve_upid`] = upid;
            }
            
            if (errorMessage) {
                updateQuery[`steps.${stepIndex}.error_message`] = errorMessage;
            }

            await VM_TaskModel.updateOne({ task_id: taskId }, updateQuery);
        } catch (error) {
            logger.error(`Error updating task step ${stepIndex} for ${taskId}:`, error);
        }
    }

    private async _configureVMCPU(node: string, vmid: string, cpuCores: number, taskId: string, stepIndex: number): Promise<{ success: boolean, errorMessage?: string }> {
        try {
            await this._updateTaskStep(taskId, stepIndex, VM_Task_Status.IN_PROGRESS);

            const configResp: PVEResp = await callWithUnauthorized('PUT', pve_api.nodes_qemu_config(node, vmid), {
                cores: cpuCores
            }, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                }
            });

            // CPU 配置通常是立即執行，不返回 UPID
            // 如果返回 null，表示配置成功完成
            if (configResp && configResp.data === null) {
                await this._updateTaskStep(taskId, stepIndex, VM_Task_Status.COMPLETED, "CPU configuration completed");
                return { success: true };
            }

            // 如果返回 UPID（字符串），則需要等待任務完成
            if (configResp && configResp.data && typeof configResp.data === 'string') {
                const upid = configResp.data;
                console.log(`CPU configuration task initiated with UPID: ${upid}`);

                const waitResult = await this._waitForTaskCompletion(node, upid, taskId, stepIndex);
                if (!waitResult.success) {
                    await this._updateTaskStep(taskId, stepIndex, VM_Task_Status.FAILED, undefined, waitResult.errorMessage);
                    return { success: false, errorMessage: waitResult.errorMessage };
                }

                await this._updateTaskStep(taskId, stepIndex, VM_Task_Status.COMPLETED, "CPU configuration completed");
                return { success: true };
            }

            // 如果沒有返回任何數據，視為失敗
            await this._updateTaskStep(taskId, stepIndex, VM_Task_Status.FAILED, undefined, "Failed to configure CPU cores - no response data");
            return { success: false, errorMessage: "Failed to configure CPU cores - no response data" };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Unknown error";
            await this._updateTaskStep(taskId, stepIndex, VM_Task_Status.FAILED, undefined, errorMsg);
            return { success: false, errorMessage: errorMsg };
        }
    }

    private async _configureVMMemory(node: string, vmid: string, memorySize: number, taskId: string, stepIndex: number): Promise<{ success: boolean, errorMessage?: string }> {
        try {
            await this._updateTaskStep(taskId, stepIndex, VM_Task_Status.IN_PROGRESS);

            const configResp: PVEResp = await callWithUnauthorized('PUT', pve_api.nodes_qemu_config(node, vmid), {
                memory: memorySize
            }, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                }
            });

            // Memory 配置通常是立即執行，不返回 UPID
            // 如果返回 null，表示配置成功完成
            if (configResp && configResp.data === null) {
                await this._updateTaskStep(taskId, stepIndex, VM_Task_Status.COMPLETED, "Memory configuration completed");
                return { success: true };
            }

            // 如果返回 UPID（字符串），則需要等待任務完成
            if (configResp && configResp.data && typeof configResp.data === 'string') {
                const upid = configResp.data;
                console.log(`Memory configuration task initiated with UPID: ${upid}`);

                const waitResult = await this._waitForTaskCompletion(node, upid, taskId, stepIndex);
                if (!waitResult.success) {
                    await this._updateTaskStep(taskId, stepIndex, VM_Task_Status.FAILED, undefined, waitResult.errorMessage);
                    return { success: false, errorMessage: waitResult.errorMessage };
                }

                await this._updateTaskStep(taskId, stepIndex, VM_Task_Status.COMPLETED, "Memory configuration completed");
                return { success: true };
            }

            // 如果沒有返回任何數據，視為失敗
            await this._updateTaskStep(taskId, stepIndex, VM_Task_Status.FAILED, undefined, "Failed to configure memory - no response data");
            return { success: false, errorMessage: "Failed to configure memory - no response data" };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Unknown error";
            await this._updateTaskStep(taskId, stepIndex, VM_Task_Status.FAILED, undefined, errorMsg);
            return { success: false, errorMessage: errorMsg };
        }
    }

    private async _resizeVMDisk(node: string, vmid: string, diskSize: number, taskId: string, stepIndex: number): Promise<{ success: boolean, errorMessage?: string }> {
        try {
            await this._updateTaskStep(taskId, stepIndex, VM_Task_Status.IN_PROGRESS);

            // 等待磁碟準備就緒
            logger.info(`Waiting for VM ${vmid} disk to be ready before resizing...`);
            const diskReadyCheck = await this._waitForVMDiskReady(node, vmid, 15);
            if (!diskReadyCheck.success) {
                logger.error(`Disk not ready for resize on VM ${vmid}: ${diskReadyCheck.errorMessage}`);
                await this._updateTaskStep(taskId, stepIndex, VM_Task_Status.FAILED, undefined, diskReadyCheck.errorMessage);
                return { success: false, errorMessage: diskReadyCheck.errorMessage };
            }

            // 額外等待一點時間讓磁碟穩定
            logger.info(`Waiting additional time for VM ${vmid} disk to stabilize before resize...`);
            await new Promise(resolve => setTimeout(resolve, 5000));

            const resizeResp: PVEResp = await callWithUnauthorized('PUT', pve_api.nodes_qemu_resize(node, vmid), {
                disk: 'scsi0',
                size: `${diskSize}G`
            }, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                }
            });

            // Disk resize 通常是立即執行，不返回 UPID
            // 如果返回 null，表示配置成功完成
            if (resizeResp && resizeResp.data === null) {
                await this._updateTaskStep(taskId, stepIndex, VM_Task_Status.COMPLETED, "Disk resize completed");
                return { success: true };
            }

            // 如果返回 UPID（字符串），則需要等待任務完成
            if (resizeResp && resizeResp.data && typeof resizeResp.data === 'string') {
                const upid = resizeResp.data;
                console.log(`Disk resize task initiated with UPID: ${upid}`);

                const waitResult = await this._waitForTaskCompletion(node, upid, taskId, stepIndex);
                if (!waitResult.success) {
                    await this._updateTaskStep(taskId, stepIndex, VM_Task_Status.FAILED, undefined, waitResult.errorMessage);
                    return { success: false, errorMessage: waitResult.errorMessage };
                }

                await this._updateTaskStep(taskId, stepIndex, VM_Task_Status.COMPLETED, "Disk resize completed");
                return { success: true };
            }

            // 如果沒有返回任何數據，視為失敗
            await this._updateTaskStep(taskId, stepIndex, VM_Task_Status.FAILED, undefined, "Failed to resize disk - no response data");
            return { success: false, errorMessage: "Failed to resize disk - no response data" };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Unknown error";
            await this._updateTaskStep(taskId, stepIndex, VM_Task_Status.FAILED, undefined, errorMsg);
            return { success: false, errorMessage: errorMsg };
        }
    }

    private async _configureCloudInit(node: string, vmid: string, ciuser: string, cipassword: string, taskId: string, stepIndex: number): Promise<{ success: boolean, errorMessage?: string }> {
        try {
            await this._updateTaskStep(taskId, stepIndex, VM_Task_Status.IN_PROGRESS);

            const configData: any = {};
            if (ciuser) {
                configData.ciuser = ciuser;
            }
            if (cipassword) {
                configData.cipassword = cipassword;
            }

            if (Object.keys(configData).length === 0) {
                await this._updateTaskStep(taskId, stepIndex, VM_Task_Status.COMPLETED, undefined, "No cloud-init configuration needed");
                return { success: true };
            }

            const configResp: PVEResp = await callWithUnauthorized('PUT', pve_api.nodes_qemu_config(node, vmid), configData, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                }
            });

            // Cloud-Init 配置通常是立即執行，不返回 UPID
            // 如果返回 null，表示配置成功完成
            if (configResp && configResp.data === null) {
                await this._updateTaskStep(taskId, stepIndex, VM_Task_Status.COMPLETED, "Cloud-Init configuration completed");
                return { success: true };
            }

            // 如果返回 UPID（字符串），則需要等待任務完成
            if (configResp && configResp.data && typeof configResp.data === 'string') {
                const upid = configResp.data;
                console.log(`Cloud-Init configuration task initiated with UPID: ${upid}`);

                const waitResult = await this._waitForTaskCompletion(node, upid, taskId, stepIndex);
                if (!waitResult.success) {
                    await this._updateTaskStep(taskId, stepIndex, VM_Task_Status.FAILED, undefined, waitResult.errorMessage);
                    return { success: false, errorMessage: waitResult.errorMessage };
                }

                await this._updateTaskStep(taskId, stepIndex, VM_Task_Status.COMPLETED, "Cloud-Init configuration completed");
                return { success: true };
            }

            // 如果沒有返回任何數據，視為失敗
            await this._updateTaskStep(taskId, stepIndex, VM_Task_Status.FAILED, undefined, "Failed to configure cloud-init - no response data");
            return { success: false, errorMessage: "Failed to configure cloud-init - no response data" };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Unknown error";
            await this._updateTaskStep(taskId, stepIndex, VM_Task_Status.FAILED, undefined, errorMsg);
            return { success: false, errorMessage: errorMsg };
        }
    }

    // 驗證用戶是否有權限刪除 VM
    private async _validateUserForVMDeletion(Request: Request, token_role: string): Promise<VMDeletionUserValidation> {
        try {
            if (token_role === 'superadmin') {
                const { user, error } = await validateTokenAndGetSuperAdminUser<User>(Request);
                return { user, error };
            } else {
                const { user, error } = await validateTokenAndGetUser<User>(Request);
                return { user, error };
            }
        } catch (error) {
            return { 
                user: null, 
                error: createResponse(500, "Error validating user") 
            };
        }
    }

    // 獲取 VM 當前配置
    private async _getCurrentVMConfig(node: string, vmid: string): Promise<VMConfig | null> {
        try {
            const configResp: PVEResp = await callWithUnauthorized('GET', pve_api.nodes_qemu_config(node, vmid), undefined, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                }
            });

            if (configResp && configResp.data) {
                return configResp.data as VMConfig;
            }
            return null;
        } catch (error) {
            logger.error(`Error getting VM config for node ${node}, vmid ${vmid}:`, error);
            return null;
        }
    }

    // 處理 PVE 刪除響應
    private async _processDeletionResponse(deleteResp: PVEResp, vm: { pve_node: string; pve_vmid: string }): Promise<{success: boolean, taskId?: string, errorMessage?: string}> {
        let deletionSuccess = false;
        let taskId: string | undefined = undefined;
        
        // 檢查 PVE API 響應是否有效
        if (!deleteResp) {
            return {
                success: false,
                errorMessage: "PVE API returned no response or invalid response"
            };
        }

        // 檢查 PVE API 是否返回了有效的 data
        if (deleteResp.data !== undefined) {
            // PVE API 返回的 data 是 UPID 字串 (任務模式)
            if (typeof deleteResp.data === 'string') {
                taskId = deleteResp.data;
                logger.info(`[deleteUserVM] VM deletion task initiated with UPID: ${taskId}`);
                console.log(`[deleteUserVM] Waiting for deletion task to complete, UPID: ${taskId}`);
                
                // 等待刪除任務完成，此時 taskId 已確定是 string
                const waitResult = await this._waitForDeletionTaskCompletion(vm.pve_node, taskId as string, 'VM deletion');
                deletionSuccess = waitResult.success;
                
                if (!deletionSuccess) {
                    return {
                        success: false,
                        errorMessage: `VM deletion task failed: ${waitResult.errorMessage}`
                    };
                }
            } else if (deleteResp.data === null) {
                // 返回 null 表示立即執行成功
                deletionSuccess = true;
                console.log("[deleteUserVM] VM deletion completed immediately (data=null)");
            } else {
                // 其他類型的 data 值，視為失敗
                return {
                    success: false,
                    errorMessage: `Unexpected PVE API response data type: ${typeof deleteResp.data}`
                };
            }
        } else {
            // 沒有 data 屬性，視為失敗
            return {
                success: false,
                errorMessage: "PVE API response missing data property"
            };
        }

        return {
            success: deletionSuccess,
            taskId: taskId
        };
    }

    // 使用 VM 配置回收資源
    private async _reclaimVMResourcesWithConfig(userId: string, vmConfig: VMConfig): Promise<void> {
        try {
            const user = await UsersModel.findById(userId).exec();
            if (!user || !user.used_compute_resource_id) {
                logger.error(`User ${userId} not found or no used compute resource ID`);
                return;
            }

            const diskSize = PVEUtils.extractDiskSizeFromConfig(vmConfig.scsi0);
            
            await UsedComputeResourceModel.updateOne(
                { _id: user.used_compute_resource_id },
                {
                    $inc: {
                        cpu_cores: -vmConfig.cores,
                        memory: -vmConfig.memory,
                        storage: diskSize ? -diskSize : 0
                    }
                }
            );

            logger.info(`Successfully reclaimed resources for user ${userId}: CPU=${vmConfig.cores}, Memory=${vmConfig.memory}MB, Disk=${diskSize}GB`);
        } catch (error) {
            logger.error(`Error reclaiming resources for user ${userId}:`, error);
            throw error;
        }
    }

    // 清理資料庫中的 VM 記錄
    private async _cleanupVMFromDatabase(userId: string, vm_id: string, vmConfig: VMConfig | null, skipResourceReclaim: boolean = false): Promise<void> {
        try {
            // 從資料庫中刪除 VM 記錄
            const deleteResult: DeleteResult = await VMModel.deleteOne({ _id: vm_id });
            
            if (deleteResult.deletedCount === 0) {
                logger.warn(`VM ${vm_id} not found in database during cleanup`);
            } else {
                logger.info(`Successfully deleted VM ${vm_id} from database`);
            }

            // 從用戶的 owned_vms 列表中移除
            const updateResult: UpdateResult = await UsersModel.updateOne(
                { _id: userId },
                { $pull: { owned_vms: vm_id } }
            );

            if (updateResult.modifiedCount === 0) {
                logger.warn(`VM ${vm_id} not found in user ${userId}'s owned_vms list`);
            } else {
                logger.info(`Successfully removed VM ${vm_id} from user ${userId}'s owned_vms list`);
            }

            // 如果沒有跳過資源回收且有 VM 配置，則回收資源
            if (!skipResourceReclaim && vmConfig) {
                try {
                    await this._reclaimVMResourcesWithConfig(userId, vmConfig);
                } catch (resourceError) {
                    logger.error(`Error reclaiming resources during cleanup:`, resourceError);
                    // 不拋出錯誤，因為 VM 記錄已經被清理
                }
            }
        } catch (error) {
            logger.error(`Error cleaning up VM ${vm_id} from database:`, error);
            throw error;
        }
    }

    // 等待任務完成的重載版本（用於刪除操作）
    private async _waitForDeletionTaskCompletion(node: string, upid: string, operationType: string): Promise<{ success: boolean, errorMessage?: string }> {
        const maxRetries = 300; // 最多等待 5 分鐘
        let retries = 0;

        while (retries < maxRetries) {
            try {
                const taskStatus: PVEResp = await callWithUnauthorized('GET', pve_api.nodes_tasks_status(node, upid), undefined, {
                    headers: {
                        'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                    }
                });

                if (taskStatus && taskStatus.data) {
                    const status = taskStatus.data as PVE_Task_Status_Response;
                    
                    if (status.status === PVE_TASK_STATUS.STOPPED) {
                        if (status.exitstatus === PVE_TASK_EXIT_STATUS.OK) {
                            logger.info(`${operationType} task ${upid} completed successfully`);
                            return { success: true };
                        } else {
                            logger.error(`${operationType} task ${upid} failed with exit status: ${status.exitstatus}`);
                            return { success: false, errorMessage: `${operationType} task failed with exit status: ${status.exitstatus}` };
                        }
                    }
                    
                    // 任務仍在運行，等待 1 秒後重試
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    retries++;
                } else {
                    return { success: false, errorMessage: "Failed to get task status" };
                }
            } catch (error) {
                logger.error(`Error checking ${operationType} task status for ${upid}:`, error);
                return { success: false, errorMessage: error instanceof Error ? error.message : "Unknown error" };
            }
        }

        return { success: false, errorMessage: `${operationType} task timeout` };
    }

    // 等待 VM 磁碟準備就緒
    private async _waitForVMDiskReady(target_node: string, vmid: string, maxRetries: number = 10): Promise<{ success: boolean, errorMessage?: string }> {
        try {
            logger.info(`Waiting for VM ${vmid} disk to be ready on node ${target_node}`);
            
            for (let i = 0; i < maxRetries; i++) {
                try {
                    const configResp: PVEResp = await callWithUnauthorized('GET', pve_api.nodes_qemu_config(target_node, vmid), undefined, {
                        headers: {
                            'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                        }
                    });

                    if (configResp && configResp.data && configResp.data.scsi0) {
                        const scsi0Config = configResp.data.scsi0;
                        
                        // 檢查磁碟是否不再處於導入/克隆狀態
                        if (!scsi0Config.includes('importing') && !scsi0Config.includes('cloning')) {
                            // 進一步檢查磁碟文件是否存在正確格式
                            const diskFormatMatch = scsi0Config.match(/\.(raw|qcow2|vmdk)/);
                            if (diskFormatMatch) {
                                logger.info(`VM ${vmid} disk is ready with format ${diskFormatMatch[1]}: ${scsi0Config}`);
                                return { success: true };
                            } else {
                                logger.warn(`VM ${vmid} disk format unclear (attempt ${i + 1}/${maxRetries}): ${scsi0Config}`);
                            }
                        } else {
                            logger.info(`VM ${vmid} disk still being prepared (attempt ${i + 1}/${maxRetries}): ${scsi0Config}`);
                        }
                    } else {
                        logger.warn(`VM ${vmid} disk config not found (attempt ${i + 1}/${maxRetries})`);
                        if (configResp && configResp.data) {
                            logger.warn(`VM ${vmid} config data:`, JSON.stringify(configResp.data, null, 2));
                        }
                    }
                } catch (error) {
                    logger.warn(`Error checking VM ${vmid} disk status (attempt ${i + 1}/${maxRetries}):`, error);
                    
                    // 如果是 JSON 解析錯誤，特別記錄
                    if (error instanceof SyntaxError && error.message.includes('JSON')) {
                        logger.error(`JSON parsing error while checking disk status for VM ${vmid}:`, error.message);
                    }
                }

                // 等待 10 秒後再次檢查
                if (i < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 10000));
                }
            }

            return { success: false, errorMessage: `VM ${vmid} disk not ready after ${maxRetries} attempts` };
        } catch (error) {
            logger.error(`Error waiting for VM ${vmid} disk to be ready:`, error);
            return { success: false, errorMessage: `Failed to wait for VM disk readiness` };
        }
    }
}
