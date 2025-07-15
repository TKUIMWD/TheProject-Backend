import { Service } from "../abstract/Service";
import { resp, createResponse } from "../utils/resp";
import { PVEResp } from "../interfaces/Response/PVEResp";
import { Request } from "express";
import { getTokenRole, validateTokenAndGetAdminUser, validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { pve_api } from "../enum/PVE_API";
import { callWithUnauthorized } from "../utils/fetch";
import { PVE_qemu_config, PVE_Task_Status_Response, PVE_Task_Status, PVE_Task_ExitStatus, PVE_TASK_STATUS, PVE_TASK_EXIT_STATUS } from "../interfaces/PVE";
import { VMTemplateModel } from "../orm/schemas/VM/VMTemplateSchemas";
import { VM_Template_Info } from "../interfaces/VM/VM_Template";
import { UsersModel } from "../orm/schemas/UserSchemas";
import { VM_TaskModel } from "../orm/schemas/VM/VM_TaskSchemas";
import { VM_Task, VM_Task_Status } from "../interfaces/VM/VM_Task";
import { VMModel } from "../orm/schemas/VM/VMSchemas";
import { ComputeResourcePlanModel } from "../orm/schemas/ComputeResourcePlanSchemas";
import { UsedComputeResourceModel } from "../orm/schemas/UsedComputeResourceSchemas";
import { User } from "../interfaces/User";
import {logger} from "../middlewares/log";
import { VMConfig } from "../interfaces/VM/VM";
import { VMDeletionResponse, VMDeletionUserValidation } from "../interfaces/Response/VMResp";

const PVE_API_ADMINMODE_TOKEN = process.env.PVE_API_ADMINMODE_TOKEN;
const PVE_API_SUPERADMINMODE_TOKEN = process.env.PVE_API_SUPERADMINMODE_TOKEN;
const PVE_API_USERMODE_TOKEN = process.env.PVE_API_USERMODE_TOKEN;

const ALLOW_THE_TEST_ENDPOINT = true;

export class PVEService extends Service {


    // VM 創建任務步驟索引
    private readonly VM_CREATION_STEP_INDICES = {
        CLONE: 0,
        CPU: 1,
        MEMORY: 2,
        DISK: 3,
        CLOUD_INIT: 4
    };


    // PVEService 私有方法，用於獲取集群下一個可用 ID
    // 在其他方法中調用此方法以獲取下一個 ID
    private async _getNextId(): Promise<resp<PVEResp | undefined>> {
        try {
            const nextId: PVEResp = await callWithUnauthorized('GET', pve_api.cluster_next_id, undefined, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_USERMODE_TOKEN}`
                }
            });
            return createResponse(200, "Next ID fetched successfully", nextId);
        } catch (error) {
            console.error("Error in _getNextId:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async test(Request: Request): Promise<resp<PVEResp | undefined>> {
        if (!ALLOW_THE_TEST_ENDPOINT) {
            return createResponse(403, "Test endpoint is disabled");
        }
        return createResponse(200, "Test endpoint is enabled");
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

    public async getQemuConfig(Request: Request): Promise<resp<PVEResp | undefined>> {
        try {
            const token_role = (await getTokenRole(Request)).role;
            
            // 從 query parameter 獲取 VM ID
            const vm_id = Request.query.id as string;
            if (!vm_id) {
                return createResponse(400, "Missing vm_id in query parameters");
            }

            // 根據角色進行不同的驗證和處理
            if (token_role === 'user') {
                // 普通用戶只能查看自己擁有的 VM
                const { user, error } = await validateTokenAndGetUser<PVEResp>(Request);
                if (error) {
                    console.error("Error validating token:", error);
                    return error;
                }

                // 檢查 VM 是否屬於該用戶
                if (!user.owned_vms.includes(vm_id)) {
                    return createResponse(403, "Access denied: VM not owned by user");
                }

                // 獲取 VM 資訊
                const vm = await VMModel.findById(vm_id).exec();
                if (!vm) {
                    return createResponse(404, "VM not found");
                }

                // 獲取基本配置（用戶只能看到基本資訊）
                const config = await this._getBasicQemuConfig(vm.pve_node, vm.pve_vmid);
                return config;

            } else if (token_role === 'admin') {
                // 管理員只能查看自己擁有的 VM
                const { user, error } = await validateTokenAndGetAdminUser<PVEResp>(Request);
                if (error) {
                    console.error("Error validating token:", error);
                    return error;
                }

                // 檢查 VM 是否屬於該用戶
                if (!user.owned_vms.includes(vm_id)) {
                    return createResponse(403, "Access denied: VM not owned by user");
                }

                // 獲取 VM 資訊
                const vm = await VMModel.findById(vm_id).exec();
                if (!vm) {
                    return createResponse(404, "VM not found");
                }

                // 獲取詳細配置
                const config = await this._getDetailedQemuConfig(vm.pve_node, vm.pve_vmid);
                return config;

            } else if (token_role === 'superadmin') {
                // 超級管理員可以查看所有 VM 的完整配置
                const { user, error } = await validateTokenAndGetSuperAdminUser<PVEResp>(Request);
                if (error) {
                    console.error("Error validating token:", error);
                    return error;
                }

                // 獲取 VM 資訊
                const vm = await VMModel.findById(vm_id).exec();
                if (!vm) {
                    return createResponse(404, "VM not found");
                }

                // 獲取完整配置
                const config = await this._getFullQemuConfig(vm.pve_node, vm.pve_vmid);
                return config;

            } else {
                return createResponse(403, "Invalid role");
            }

        } catch (error) {
            console.error("Error in getQemuConfig:", error);
            return createResponse(500, "Internal Server Error");
        }
    }


    public async getNodes(Request: Request): Promise<resp<PVEResp | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<PVEResp>(Request);
            if (error) {
                console.error("Error validating token:", error);
                return error;
            }
            const nodes: PVEResp = await callWithUnauthorized('GET', pve_api.nodes, undefined, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_ADMINMODE_TOKEN}`
                }
            });
            return createResponse(200, "Nodes fetched successfully", nodes.data);
        } catch (error) {
            console.error("Error in getNodes:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // restricted to superadmin
    // 用於獲取所有模板的詳細信息
    public async getAllTemplates(Request: Request): Promise<resp<VM_Template_Info[] | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<VM_Template_Info[]>(Request);
            if (error) {
                console.error("Error validating token:", error);
                return error;
            }

            const templates = await VMTemplateModel.find().exec();
            if (templates.length === 0) {
                return createResponse(200, "No templates found", []);
            }

            const templateInfoPromises = templates.map(async (template): Promise<VM_Template_Info> => {
                const configResp = await this._getTemplateInfo(template.pve_node, template.pve_vmid);
                if (configResp.code !== 200 || !configResp.body) {
                    throw new Error(`Failed to get qemu config for template ${template._id}: ${configResp.message}`);
                }
                const qemuConfig = configResp.body;

                const submitterUser = await UsersModel.findById(template.submitter_user_id).exec();
                if (!submitterUser) {
                    throw new Error(`User not found for ID: ${template.submitter_user_id}, template: ${template._id}`);
                }

                const templateInfo: VM_Template_Info = {
                    _id: template._id,
                    name: qemuConfig.name,
                    description: template.description,
                    submitted_date: template.submitted_date,
                    has_approved: template.has_approved,
                    submitter_user_info: {
                        username: submitterUser.username,
                        email: submitterUser.email
                    },
                    default_cpu_cores: this.extractCpuCores(qemuConfig),
                    default_memory_size: this.extractMemorySize(qemuConfig), // MB
                    default_disk_size: this.extractDiskSize(qemuConfig) // GB
                };
                return templateInfo;
            });

            const vmTemplateInfos = await Promise.all(templateInfoPromises);
            return createResponse(200, "Templates fetched successfully", vmTemplateInfos);
        } catch (error) {
            console.error("Error in getAllTemplates:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // 所有用戶都可以訪問的端點
    // 僅返回已審核通過的模板信息
    public async getAllApprovedTemplates(Request: Request): Promise<resp<VM_Template_Info[] | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<VM_Template_Info[]>(Request);
            if (error) {
                console.error("Error validating token:", error);
                return error;
            }

            // 僅查詢已審核通過的模板
            const templates = await VMTemplateModel.find({ has_approved: true }).exec();
            if (templates.length === 0) {
                return createResponse(200, "No approved templates found", []);
            }

            const templateInfoPromises = templates.map(async (template): Promise<VM_Template_Info> => {
                const configResp = await this._getTemplateInfo(template.pve_node, template.pve_vmid);
                if (configResp.code !== 200 || !configResp.body) {
                    throw new Error(`Failed to get qemu config for template ${template._id}: ${configResp.message}`);
                }
                const qemuConfig = configResp.body;

                const submitterUser = await UsersModel.findById(template.submitter_user_id).exec();
                if (!submitterUser) {
                    throw new Error(`User not found for ID: ${template.submitter_user_id}, template: ${template._id}`);
                }

                const templateInfo: VM_Template_Info = {
                    _id: template._id,
                    name: qemuConfig.name,
                    description: template.description,
                    submitted_date: template.submitted_date,
                    has_approved: template.has_approved,
                    submitter_user_info: {
                        username: submitterUser.username,
                        email: submitterUser.email
                    },
                    default_cpu_cores: this.extractCpuCores(qemuConfig),
                    default_memory_size: this.extractMemorySize(qemuConfig), // MB
                    default_disk_size: this.extractDiskSize(qemuConfig) // GB
                };
                return templateInfo;
            });

            const vmTemplateInfos = await Promise.all(templateInfoPromises);
            return createResponse(200, "Approved templates fetched successfully", vmTemplateInfos);
        } catch (error) {
            console.error("Error in getAllApprovedTemplates:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async createVMFromTemplate(Request: Request): Promise<resp<PVEResp | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<PVEResp>(Request);
            if (error) {
                logger.error("Error validating token for createVMFromTemplate:", error);
                return error;
            }

            const { template_id, name, target, storage = "NFS", full = '1', cpuCores, memorySize, diskSize, ciuser: requestCiuser, cipassword: requestCipassword } = Request.body;
            
            logger.info(`User ${user.username} (${user._id}) starting VM creation from template ${template_id}`);

            const validationResult = this._validateVMCreationParams({ template_id, name, target, cpuCores, memorySize, diskSize, ciuser: requestCiuser, cipassword: requestCipassword });
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
            const sanitizedName = this.sanitizeVMName(name);
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
            // 如果 request body 中的值是 undefined，且範本有有效值，使用範本預設值
            // 如果 request body 中的值是空字串或其他值，使用請求的值
            const ciuser = requestCiuser !== undefined ? requestCiuser : (templateHasValidCiuser ? template_info.ciuser! : '');
            const cipassword = requestCipassword !== undefined ? requestCipassword : (templateHasValidCipassword ? template_info.cipassword! : '');
            
            logger.info(`Template has valid ciuser: ${templateHasValidCiuser}, cipassword: ${templateHasValidCipassword}`);
            logger.info(`Template ciuser: "${template_info.ciuser || 'EMPTY'}", template cipassword: "${template_info.cipassword ? '[PROVIDED]' : '[NOT PROVIDED]'}"`);
            logger.info(`Request ciuser: "${requestCiuser || 'EMPTY'}", request cipassword: "${requestCipassword ? '[PROVIDED]' : '[NOT PROVIDED]'}"`);
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


    // 驗證 VM 建立參數
    private _validateVMCreationParams(params: any): resp<any> {
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

    // 獲取下一個可用的 VM ID
    private async _getNextVMId(): Promise<resp<PVEResp | undefined>> {
        const result = await this._getNextId();
        if (result.code !== 200 || !result.body) {
            console.error("Failed to get next ID:", result.message);
            return createResponse(result.code, result.message);
        }
        return result;
    }

    // 獲取範本詳細資訊
    private async _getTemplateDetails(templateId: string): Promise<resp<{ template_info: any, qemuConfig: PVE_qemu_config } | undefined>> {
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

    // 檢查資源限制
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
        }        // 檢查總限制
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

    // 建立 VM 任務記錄
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

    // 執行克隆操作
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

            if (!cloneResp || !cloneResp.data) {
                console.error("Clone operation failed:", cloneResp);
                return { success: false, errorMessage: "Failed to clone VM from template" };
            }

            logger.info(`Clone task initiated for VM ${newVmid}, UPID: ${cloneResp.data}`);
            return { success: true, upid: cloneResp.data };
        } catch (error) {
            console.error("Error in _cloneVM:", error);
            return { success: false, errorMessage: "Clone operation failed with exception" };
        }
    }

    // 配置 VM 並完成設定
    private async _configureAndFinalizeVM(target_node: string, vmid: string, cpuCores: number, memorySize: number, diskSize: number, cloneUpid: string, sourceNode: string, taskId: string, ciuser: string, cipassword: string): Promise<{ success: boolean, errorMessage?: string }> {
        try {
            console.log(`Starting VM configuration for VM ${vmid} on node ${target_node}`);

            // 等待克隆完成 - 克隆任務在源節點上執行，需要在源節點查詢狀態
            const cloneWaitResult = await this._waitForTaskCompletion(sourceNode, cloneUpid, 'clone');
            if (!cloneWaitResult.success) {
                return { success: false, errorMessage: cloneWaitResult.errorMessage };
            }

            console.log(`Clone completed, starting configuration for VM ${vmid}`);

            // 額外等待確保 VM 和磁碟完全準備好
            logger.info(`Waiting additional time for VM ${vmid} to be fully ready...`);
            await new Promise(resolve => setTimeout(resolve, 30000)); // 等待 30 秒

            // 等待 VM 磁碟準備完成 - 增加重試次數
            const diskReadyResult = await this._waitForVMDiskReady(target_node, vmid, 20);
            if (!diskReadyResult.success) {
                logger.error(`VM ${vmid} disk not ready: ${diskReadyResult.errorMessage}`);
                return { success: false, errorMessage: diskReadyResult.errorMessage };
            }

            // 配置 CPU 核心數 - 配置任務在目標節點上
            console.log(`Configuring CPU cores: ${cpuCores} for VM ${vmid}`);
            await this._updateTaskStep(taskId, this.VM_CREATION_STEP_INDICES.CPU, VM_Task_Status.IN_PROGRESS);
            const cpuResult = await this._configureVMCoresWithUpid(target_node, vmid, cpuCores);
            if (!cpuResult.success) {
                await this._updateTaskStep(taskId, this.VM_CREATION_STEP_INDICES.CPU, VM_Task_Status.FAILED, undefined, cpuResult.errorMessage);
                return { success: false, errorMessage: cpuResult.errorMessage };
            }
            await this._updateTaskStep(taskId, this.VM_CREATION_STEP_INDICES.CPU, VM_Task_Status.COMPLETED, cpuResult.upid);

            // 配置記憶體 - 配置任務在目標節點上
            console.log(`Configuring memory: ${memorySize}MB for VM ${vmid}`);
            await this._updateTaskStep(taskId, this.VM_CREATION_STEP_INDICES.MEMORY, VM_Task_Status.IN_PROGRESS);
            const memoryResult = await this._configureVMMemoryWithUpid(target_node, vmid, memorySize);
            if (!memoryResult.success) {
                await this._updateTaskStep(taskId, this.VM_CREATION_STEP_INDICES.MEMORY, VM_Task_Status.FAILED, undefined, memoryResult.errorMessage);
                return { success: false, errorMessage: memoryResult.errorMessage };
            }
            await this._updateTaskStep(taskId, this.VM_CREATION_STEP_INDICES.MEMORY, VM_Task_Status.COMPLETED, memoryResult.upid);

            // 配置磁碟大小 - 配置任務在目標節點上
            console.log(`Configuring disk size: ${diskSize}GB for VM ${vmid}`);
            await this._updateTaskStep(taskId, this.VM_CREATION_STEP_INDICES.DISK, VM_Task_Status.IN_PROGRESS);
            const diskResult = await this._configureVMDiskWithUpid(target_node, vmid, diskSize);
            if (!diskResult.success) {
                await this._updateTaskStep(taskId, this.VM_CREATION_STEP_INDICES.DISK, VM_Task_Status.FAILED, undefined, diskResult.errorMessage);
                logger.error(`Disk configuration failed for VM ${vmid}: ${diskResult.errorMessage}`);
                return { success: false, errorMessage: `Disk configuration failed: ${diskResult.errorMessage}` };
            }
            await this._updateTaskStep(taskId, this.VM_CREATION_STEP_INDICES.DISK, VM_Task_Status.COMPLETED, diskResult.upid);

            // 配置 Cloud-Init - 使用範本預設值或請求覆蓋值
            // 只有當 ciuser 和 cipassword 都是有效的非空字串時才配置
            const shouldConfigureCloudInit = ciuser && cipassword && 
                                           typeof ciuser === 'string' && ciuser.trim() !== '' && ciuser !== 'undefined' && ciuser !== 'null' &&
                                           typeof cipassword === 'string' && cipassword.trim() !== '' && cipassword !== 'undefined' && cipassword !== 'null';

            if (shouldConfigureCloudInit) {
                console.log(`Configuring cloud-init for user: ${ciuser} on VM ${vmid}`);
                logger.info(`Configuring cloud-init for VM ${vmid} with user: ${ciuser}`);
                await this._updateTaskStep(taskId, this.VM_CREATION_STEP_INDICES.CLOUD_INIT, VM_Task_Status.IN_PROGRESS);
                const ciResult = await this._configureVMCloudInitWithUpid(target_node, vmid, ciuser, cipassword);
                if (!ciResult.success) {
                    await this._updateTaskStep(taskId, this.VM_CREATION_STEP_INDICES.CLOUD_INIT, VM_Task_Status.FAILED, undefined, ciResult.errorMessage);
                    return { success: false, errorMessage: ciResult.errorMessage };
                }
                await this._updateTaskStep(taskId, this.VM_CREATION_STEP_INDICES.CLOUD_INIT, VM_Task_Status.COMPLETED, ciResult.upid);
            } else {
                // 如果沒有有效的 cloud-init 配置，標記該步驟為跳過
                logger.warn(`Skipping cloud-init configuration for VM ${vmid} - ciuser: "${ciuser}", cipassword: "${cipassword ? '[PROVIDED]' : '[NOT PROVIDED]'}"`);
                await this._updateTaskStep(taskId, this.VM_CREATION_STEP_INDICES.CLOUD_INIT, VM_Task_Status.COMPLETED, "SKIPPED", "No valid cloud-init configuration available");
            }

            logger.info(`VM ${vmid} configuration completed successfully`);
            return { success: true };
        } catch (error) {
            console.error("Error in _configureAndFinalizeVM:", error);
            return { success: false, errorMessage: "Configuration failed with exception" };
        }
    }

    // 等待任務完成 - 通用方法，使用 PVE upid 查詢任務狀態
    private async _waitForTaskCompletion(target_node: string, upid: string, taskType: string): Promise<{ success: boolean, errorMessage?: string }> {
        try {
            console.log(`Waiting for ${taskType} completion with UPID ${upid} on node ${target_node}`);

            // 輪詢檢查 PVE 任務狀態
            const maxRetries = 120; // 最多等待 600 秒 (120 * 5 秒)
            let retries = 0;

            while (retries < maxRetries) {
                try {
                    // 使用 PVE API 查詢任務狀態
                    const pveStatus = await this._checkPVETaskStatus(target_node, upid);

                    if (pveStatus && !pveStatus.error) {
                        console.log(`PVE task ${upid} status: ${pveStatus.status}, exitstatus: ${pveStatus.exitstatus}`);

                        // 任務仍在運行中
                        if (pveStatus.status === PVE_TASK_STATUS.RUNNING) {
                            const progress = pveStatus.progress || 0;
                            console.log(`${taskType} task ${upid} is running... Progress: ${progress}%`);
                        }
                        // 任務已停止，檢查結果
                        else if (pveStatus.status === PVE_TASK_STATUS.STOPPED) {
                            if (pveStatus.exitstatus === PVE_TASK_EXIT_STATUS.OK) {
                                console.log(`${taskType} task ${upid} completed successfully`);
                                return { success: true };
                            } else if (pveStatus.exitstatus === null) {
                                console.log(`${taskType} task ${upid} stopped but no exit status yet`);
                            } else {
                                // exitstatus 是錯誤訊息字串
                                console.error(`${taskType} task ${upid} failed with error: ${pveStatus.exitstatus}`);
                                return { success: false, errorMessage: `${taskType} task failed: ${pveStatus.exitstatus}` };
                            }
                        }
                    } else {
                        console.log(`Unable to get PVE task status for ${upid}, error: ${pveStatus.error}`);
                    }

                    // 等待 5 秒後再次檢查
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    retries++;

                    // 每 12 次重試（60秒）記錄一次進度
                    if (retries % 12 === 0) {
                        console.log(`Still waiting for ${taskType} task ${upid} to complete... (${retries}/${maxRetries}, ${retries * 5}s elapsed)`);
                    }
                } catch (error) {
                    console.error(`Error checking PVE task status during wait: ${error}`);
                    retries++;
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }

            return { success: false, errorMessage: `Timeout waiting for ${taskType} task ${upid} completion after ${maxRetries * 5} seconds` };
        } catch (error) {
            console.error(`Error in _waitForTaskCompletion: ${error}`);
            return { success: false, errorMessage: `Failed to wait for ${taskType} completion` };
        }
    }

    // 等待 VM 磁碟準備完成
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



    // 更新任務狀態
    private async _updateTaskStatus(taskId: string, status: VM_Task_Status, upid?: string, errorMessage?: string): Promise<void> {
        try {
            const updateData: any = {
                status: status,
                updated_at: new Date()
            };

            // 更新整體任務狀態
            await VM_TaskModel.updateOne({ task_id: taskId }, updateData);

            // 同時更新第一步（克隆步驟）的狀態
            await this._updateTaskStep(taskId, this.VM_CREATION_STEP_INDICES.CLONE, status, upid, errorMessage);
        } catch (error) {
            console.error(`Error updating task status for ${taskId}:`, error);
        }
    }

    // 更新特定步驟的狀態
    private async _updateTaskStep(taskId: string, stepIndex: number, status: VM_Task_Status, upid?: string, errorMessage?: string): Promise<void> {
        try {
            const updateData: any = {
                updated_at: new Date()
            };

            if (upid && upid !== "PENDING") {
                updateData[`steps.${stepIndex}.pve_upid`] = upid;
            }

            updateData[`steps.${stepIndex}.step_status`] = status;

            if (status === VM_Task_Status.IN_PROGRESS) {
                updateData[`steps.${stepIndex}.step_start_time`] = new Date();
            } else if (status === VM_Task_Status.COMPLETED || status === VM_Task_Status.FAILED) {
                updateData[`steps.${stepIndex}.step_end_time`] = new Date();
            }

            if (status === VM_Task_Status.FAILED && errorMessage) {
                updateData[`steps.${stepIndex}.error_message`] = errorMessage;
            }

            await VM_TaskModel.updateOne({ task_id: taskId }, updateData);
        } catch (error) {
            console.error(`Error updating task step ${stepIndex} for ${taskId}:`, error);
        }
    }

    // 更新用戶資源使用量
    private async _updateUsedComputeResources(userId: string, cpuCores: number, memorySize: number, diskSize: number): Promise<void> {
        try {
            // 首先獲取用戶信息
            const user = await UsersModel.findById(userId).exec();
            if (!user) {
                throw new Error(`User with ID ${userId} not found`);
            }

            let usedResourceId = user.used_compute_resource_id;

            // 如果用戶沒有關聯的資源使用記錄，則創建一個新的
            if (!usedResourceId) {
                const newUsedResource = await UsedComputeResourceModel.create({
                    cpu_cores: 0,
                    memory: 0,
                    storage: 0
                });
                
                usedResourceId = newUsedResource._id.toString();
                
                // 更新用戶記錄，將資源使用記錄的 ID 存儲到用戶資料表
                await UsersModel.updateOne(
                    { _id: userId },
                    { used_compute_resource_id: usedResourceId }
                );
                
                logger.info(`Created new compute resource record ${usedResourceId} for user ${userId}`);
            }

            // 更新資源使用量
            const result = await UsedComputeResourceModel.updateOne(
                { _id: usedResourceId },
                {
                    $inc: {
                        cpu_cores: cpuCores,
                        memory: memorySize,
                        storage: diskSize
                    }
                }
            );

            if (result.matchedCount > 0) {
                logger.info(`Updated compute resources for user ${userId}: ${cpuCores} CPU cores, ${memorySize} MB memory, ${diskSize} GB storage`);
            } else {
                throw new Error(`Failed to update compute resources for user ${userId}: resource record not found`);
            }
        } catch (error) {
            logger.error(`Error updating compute resources for user ${userId}:`, error);
            throw error; // 重新拋出錯誤，讓調用者知道更新失敗
        }
    }

    // 配置 VM 的 CPU 核心數 - 立即執行
    private async _configureVMCoresWithUpid(target_node: string, vmid: string, cores: number): Promise<{ success: boolean, upid?: string, errorMessage?: string }> {
        try {
            if (cores <= 0) {
                return { success: false, errorMessage: "CPU cores must be greater than 0" };
            }

            console.log(`Configuring CPU cores for VM ${vmid}: ${cores} cores`);

            const configResp: PVEResp = await callWithUnauthorized('PUT', pve_api.nodes_qemu_config(target_node, vmid), {
                cores: cores
            }, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_ADMINMODE_TOKEN}`
                }
            });
            console.log("CPU configResp:", configResp);


            // CPU 配置通常是立即執行，不返回 UPID
            // 如果返回 null，表示配置成功完成
            if (configResp && configResp.data === null) {
                console.log(`CPU cores configured successfully for VM ${vmid}: ${cores} cores`);
                return { success: true };
            }

            // 如果返回 UPID（字符串），則需要等待任務完成
            if (configResp && configResp.data && typeof configResp.data === 'string') {
                const upid = configResp.data;
                console.log(`CPU configuration task initiated with UPID: ${upid}`);

                const waitResult = await this._waitForTaskCompletion(target_node, upid, 'CPU configuration');
                if (!waitResult.success) {
                    return { success: false, errorMessage: waitResult.errorMessage };
                }

                console.log(`CPU cores configured successfully for VM ${vmid}: ${cores} cores`);
                return { success: true, upid };
            }

            // 如果沒有返回任何數據，視為失敗
            return { success: false, errorMessage: "Failed to configure CPU cores - no response data" };
        } catch (error) {
            console.error(`Error configuring CPU cores for VM ${vmid}:`, error);
            return { success: false, errorMessage: "Failed to configure CPU cores" };
        }
    }

    // 配置 VM 的記憶體大小 - 立即執行
    private async _configureVMMemoryWithUpid(target_node: string, vmid: string, memory: number): Promise<{ success: boolean, upid?: string, errorMessage?: string }> {
        try {
            if (memory <= 0) {
                return { success: false, errorMessage: "Memory size must be greater than 0" };
            }

            console.log(`Configuring memory for VM ${vmid}: ${memory}MB`);

            const configResp: PVEResp = await callWithUnauthorized('PUT', pve_api.nodes_qemu_config(target_node, vmid), {
                memory: memory,
                balloon: 0 // 禁用 balloon 以確保固定記憶體大小
            }, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_ADMINMODE_TOKEN}`
                }
            });

            console.log("Memory configResp:", configResp);

            // 記憶體配置通常是立即執行，不返回 UPID
            // 如果返回 null，表示配置成功完成
            if (configResp && configResp.data === null) {
                console.log(`Memory configured successfully for VM ${vmid}: ${memory}MB`);
                return { success: true };
            }

            // 如果返回 UPID（字符串），則需要等待任務完成
            if (configResp && configResp.data && typeof configResp.data === 'string') {
                const upid = configResp.data;
                console.log(`Memory configuration task initiated with UPID: ${upid}`);

                const waitResult = await this._waitForTaskCompletion(target_node, upid, 'Memory configuration');
                if (!waitResult.success) {
                    return { success: false, errorMessage: waitResult.errorMessage };
                }

                console.log(`Memory configured successfully for VM ${vmid}: ${memory}MB`);
                return { success: true, upid };
            }

            // 如果沒有返回任何數據，視為失敗
            return { success: false, errorMessage: "Failed to configure memory - no response data" };
        } catch (error) {
            console.error(`Error configuring memory for VM ${vmid}:`, error);
            return { success: false, errorMessage: "Failed to configure memory" };
        }
    }

    // 配置 VM 磁碟大小 - 計算增量並調整
    private async _configureVMDiskWithUpid(target_node: string, vmid: string, targetDiskSize: number): Promise<{ success: boolean, upid?: string, errorMessage?: string }> {
        try {
            if (targetDiskSize <= 0) {
                return { success: false, errorMessage: "Target disk size must be greater than 0" };
            }

            // 獲取當前磁碟大小
            const currentSizeResult = await this._getCurrentDiskSize(target_node, vmid);
            if (!currentSizeResult.success || currentSizeResult.currentSize === undefined) {
                return { success: false, errorMessage: currentSizeResult.errorMessage || "Failed to get current disk size" };
            }

            const currentSize = currentSizeResult.currentSize;
            const increaseSize = targetDiskSize - currentSize;

            console.log(`Current disk size: ${currentSize}GB, Target size: ${targetDiskSize}GB, Increase by: ${increaseSize}GB`);

            // 如果目標大小小於或等於當前大小，不需要調整
            if (increaseSize <= 0) {
                console.log(`No disk resize needed for VM ${vmid}. Current size (${currentSize}GB) >= target size (${targetDiskSize}GB)`);
                return { success: true };
            }

            // 在調整磁碟前，再次檢查磁碟狀態並等待更長時間
            const diskReadyCheck = await this._waitForVMDiskReady(target_node, vmid, 15);
            if (!diskReadyCheck.success) {
                logger.error(`Disk not ready for resize on VM ${vmid}: ${diskReadyCheck.errorMessage}`);
                return { success: false, errorMessage: diskReadyCheck.errorMessage };
            }
            
            // 額外等待確保磁碟完全穩定
            logger.info(`Waiting additional time for VM ${vmid} disk to stabilize before resize...`);
            await new Promise(resolve => setTimeout(resolve, 20000)); // 等待 20 秒

            console.log(`Resizing disk for VM ${vmid}: +${increaseSize}GB`);

            // 使用正確的 resize API - PUT 方法
            const resizeResp: PVEResp = await callWithUnauthorized('PUT', pve_api.nodes_qemu_resize(target_node, vmid), {
                disk: 'scsi0',
                size: `+${increaseSize}G`
            }, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                }
            });

            console.log("Disk resizeResp:", resizeResp);

            // 磁碟調整可能立即執行或返回 UPID
            // 如果返回 null，表示調整成功完成
            if (resizeResp && resizeResp.data === null) {
                console.log(`Disk resized successfully for VM ${vmid}: +${increaseSize}GB`);
                return { success: true };
            }

            // 如果返回 UPID（字符串），則需要等待任務完成
            if (resizeResp && resizeResp.data && typeof resizeResp.data === 'string') {
                const upid = resizeResp.data;
                console.log(`Disk resize task initiated with UPID: ${upid}`);

                const waitResult = await this._waitForTaskCompletion(target_node, upid, 'Disk resize');
                if (!waitResult.success) {
                    return { success: false, errorMessage: waitResult.errorMessage };
                }

                console.log(`Disk resized successfully for VM ${vmid}: +${increaseSize}GB`);
                return { success: true, upid };
            }

            // 如果沒有返回任何數據，視為失敗
            return { success: false, errorMessage: "Failed to resize disk - no response data" };
        } catch (error) {
            console.error(`Error resizing disk for VM ${vmid}:`, error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return { success: false, errorMessage: `Failed to resize disk: ${errorMessage}` };
        }
    }

    // 配置 VM Cloud-Init - 可能立即執行或返回 UPID
    private async _configureVMCloudInitWithUpid(target_node: string, vmid: string, ciuser: string, cipassword: string): Promise<{ success: boolean, upid?: string, errorMessage?: string }> {
        try {
            console.log(`Configuring cloud-init for VM ${vmid} with user: ${ciuser}`);

            const cloudInitConfig = {
                ciuser: ciuser,
                cipassword: cipassword
            };

            const configResp: PVEResp = await callWithUnauthorized('PUT', pve_api.nodes_qemu_config(target_node, vmid), cloudInitConfig, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_ADMINMODE_TOKEN}`
                }
            });

            console.log("Cloud-init configResp:", configResp);

            // Cloud-init 配置可能立即執行或返回 UPID
            // 如果返回 null，表示配置成功完成
            if (configResp && configResp.data === null) {
                console.log(`Cloud-init configured successfully for VM ${vmid}`);
                return { success: true };
            }

            // 如果返回 UPID（字符串），則需要等待任務完成
            if (configResp && configResp.data && typeof configResp.data === 'string') {
                const upid = configResp.data;
                console.log(`Cloud-init configuration task initiated with UPID: ${upid}`);

                const waitResult = await this._waitForTaskCompletion(target_node, upid, 'Cloud-init configuration');
                if (!waitResult.success) {
                    return { success: false, errorMessage: waitResult.errorMessage };
                }

                console.log(`Cloud-init configured successfully for VM ${vmid}`);
                return { success: true, upid };
            }

            // 如果沒有返回任何數據，視為失敗
            return { success: false, errorMessage: "Failed to configure cloud-init - no response data" };
        } catch (error) {
            console.error(`Error configuring cloud-init for VM ${vmid}:`, error);
            return { success: false, errorMessage: "Failed to configure cloud-init" };
        }
    }

    private extractCpuCores(qemuConfig: PVE_qemu_config): number {
        return qemuConfig.cores;
    }

    private extractMemorySize(qemuConfig: PVE_qemu_config): number {
        const memoryStr = qemuConfig.memory;
        const memoryNum = parseInt(memoryStr, 10);
        if (isNaN(memoryNum)) {
            throw new Error(`Invalid memory format: ${memoryStr}`);
        }
        return memoryNum;
    }

    private extractDiskSize(qemuConfig: PVE_qemu_config): number {
        const scsi0 = qemuConfig.scsi0;
        if (!scsi0) {
            throw new Error("No scsi0 disk configuration found");
        }

        const sizeMatch = scsi0.match(/size=(\d+)G/);
        if (!sizeMatch) {
            throw new Error(`Unable to parse disk size from scsi0: ${scsi0}`);
        }

        return parseInt(sizeMatch[1], 10);
    }

    // 驗證和清理 VM 名稱以符合 DNS 格式要求
    private sanitizeVMName(name: string): string | null {
        if (!name || typeof name !== 'string') {
            return null;
        }

        // 移除或替換不合法的字符
        let sanitized = name
            .toLowerCase()                    // 轉為小寫
            .replace(/[^a-z0-9.-]/g, '-')    // 替換非字母數字、點、連字符的字符為連字符
            .replace(/^[-.]|[-.]$/g, '')     // 移除開頭和結尾的連字符或點
            .replace(/[-]{2,}/g, '-')        // 將多個連續連字符替換為單個
            .replace(/[.]{2,}/g, '.')        // 將多個連續點替換為單個
            .substring(0, 63);               // DNS 名稱最大長度為 63 字符

        // 確保名稱不為空且符合 DNS 格式
        if (!sanitized || sanitized.length === 0) {
            return null;
        }

        // 確保不以連字符開頭或結尾
        if (sanitized.startsWith('-') || sanitized.endsWith('-')) {
            sanitized = sanitized.replace(/^-+|-+$/g, '');
        }

        // 最終驗證
        const dnsNameRegex = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;
        return dnsNameRegex.test(sanitized) ? sanitized : null;
    }

    // 獲取 VM 當前磁碟大小
    private async _getCurrentDiskSize(target_node: string, vmid: string): Promise<{ success: boolean, currentSize?: number, errorMessage?: string }> {
        try {
            const configResp: PVEResp = await callWithUnauthorized('GET', pve_api.nodes_qemu_config(target_node, vmid), undefined, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_ADMINMODE_TOKEN}`
                }
            });

            if (configResp && configResp.data) {
                const config = configResp.data;
                if (config.scsi0) {
                    // 檢查磁碟是否仍在準備中
                    if (config.scsi0.includes('importing') || config.scsi0.includes('cloning')) {
                        return { success: false, errorMessage: `Disk still being prepared: ${config.scsi0}` };
                    }

                    // 解析 scsi0 配置，例如 "NFS:105/vm-105-disk-0.raw,size=32G"
                    const sizeMatch = config.scsi0.match(/size=(\d+)G/);
                    if (sizeMatch) {
                        const currentSize = parseInt(sizeMatch[1]);
                        logger.info(`Current disk size for VM ${vmid}: ${currentSize}GB (from: ${config.scsi0})`);
                        return { success: true, currentSize };
                    } else {
                        logger.error(`Cannot parse disk size from scsi0: ${config.scsi0}`);
                        return { success: false, errorMessage: `Cannot parse disk size from: ${config.scsi0}` };
                    }
                } else {
                    return { success: false, errorMessage: `No scsi0 disk found for VM ${vmid}` };
                }
            }

            return { success: false, errorMessage: "Failed to get VM configuration" };
        } catch (error) {
            logger.error(`Error getting current disk size for VM ${vmid}:`, error);
            return { success: false, errorMessage: "Failed to get current disk size" };
        }
    }

    // 檢視多個 VM 任務狀態的自定義接口
    public async getMultipleTasksStatus(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetUser<any>(Request);
            if (error) {
                console.error("Error validating token:", error);
                return error;
            }

            const { task_ids } = Request.body;

            if (!task_ids || !Array.isArray(task_ids) || task_ids.length === 0) {
                return createResponse(400, "task_ids must be a non-empty array");
            }

            const tasks = await VM_TaskModel.find({
                task_id: { $in: task_ids },
                user_id: user._id.toString()
            }).exec();

            if (tasks.length === 0) {
                return createResponse(200, "No tasks found for the provided task IDs", []);
            }

            const taskStatusPromises = tasks.map(async (task) => {
                return await this._getTaskWithPVEStatus(task);
            });

            const tasksWithStatus = await Promise.all(taskStatusPromises);

            return createResponse(200, "Multiple tasks status fetched successfully", tasksWithStatus);
        } catch (error) {
            console.error("Error in getMultipleTasksStatus:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // 獲取用戶所有 VM 任務的狀態
    public async getUserAllTasksStatus(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetUser<any>(Request);
            if (error) {
                console.error("Error validating token:", error);
                return error;
            }

            // 可選的分頁參數
            const page = parseInt(Request.query.page as string) || 1;
            const limit = parseInt(Request.query.limit as string) || 10;
            const status = Request.query.status as string; // 可選的狀態過濾

            // 建立查詢條件
            const query: any = { user_id: user._id.toString() };
            if (status) {
                query.status = status;
            }

            // 分頁查詢
            const skip = (page - 1) * limit;
            const tasks = await VM_TaskModel.find(query)
                .sort({ created_at: -1 }) // 按建立時間倒序
                .skip(skip)
                .limit(limit)
                .exec();

            const totalTasks = await VM_TaskModel.countDocuments(query);

            if (tasks.length === 0) {
                return createResponse(200, "No tasks found", {
                    tasks: [],
                    pagination: {
                        page,
                        limit,
                        total: totalTasks,
                        totalPages: Math.ceil(totalTasks / limit)
                    }
                });
            }

            // 並發檢查所有任務的 PVE 狀態
            const taskStatusPromises = tasks.map(async (task) => {
                return await this._getTaskWithPVEStatus(task);
            });

            const tasksWithStatus = await Promise.all(taskStatusPromises);

            return createResponse(200, "User tasks status fetched successfully", {
                tasks: tasksWithStatus,
                pagination: {
                    page,
                    limit,
                    total: totalTasks,
                    totalPages: Math.ceil(totalTasks / limit)
                }
            });
        } catch (error) {
            console.error("Error in getUserAllTasksStatus:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // 即時檢查 PVE 任務狀態並更新本地記錄
    public async refreshTaskStatus(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetUser<any>(Request);
            if (error) {
                console.error("Error validating token:", error);
                return error;
            }

            const { task_id } = Request.body;
            if (!task_id) {
                return createResponse(400, "task_id is required");
            }

            // 檢查任務是否屬於當前用戶
            const task = await VM_TaskModel.findOne({
                task_id: task_id,
                user_id: user._id.toString()
            }).exec();

            if (!task) {
                return createResponse(404, "Task not found or access denied");
            }

            // 獲取最新的 PVE 狀態並更新本地記錄
            const refreshedTask = await this._refreshAndUpdateTaskStatus(task);

            return createResponse(200, "Task status refreshed successfully", refreshedTask);
        } catch (error) {
            console.error("Error in refreshTaskStatus:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // 輔助方法：獲取任務及其 PVE 狀態
    private async _getTaskWithPVEStatus(task: any): Promise<any> {
        try {
            const taskData = {
                task_id: task.task_id,
                vmid: task.vmid,
                template_vmid: task.template_vmid,
                target_node: task.target_node,
                status: task.status,
                progress: task.progress,
                created_at: task.created_at,
                updated_at: task.updated_at,
                steps: task.steps,
                pve_status: null as any
            };

            // 如果任務有 PVE UPID，則檢查 PVE 狀態
            if (task.steps && task.steps.length > 0 && task.steps[0].pve_upid) {
                const pveStatus = await this._checkPVETaskStatus(task.target_node, task.steps[0].pve_upid);
                taskData.pve_status = pveStatus;
            }

            return taskData;
        } catch (error) {
            console.error(`Error getting task with PVE status for ${task.task_id}:`, error);
            return {
                task_id: task.task_id,
                vmid: task.vmid,
                template_vmid: task.template_vmid,
                target_node: task.target_node,
                status: task.status,
                progress: task.progress,
                created_at: task.created_at,
                updated_at: task.updated_at,
                steps: task.steps,
                pve_status: { error: "Failed to fetch PVE status" }
            };
        }
    }

    // 檢查 PVE 任務狀態
    private async _checkPVETaskStatus(node: string, upid: string): Promise<PVE_Task_Status_Response> {
        try {
            const statusResp: PVEResp = await callWithUnauthorized('GET', pve_api.nodes_tasks_status(node, upid), undefined, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                }
            });
            console.log(`Checking PVE task status for UPID ${upid} on node ${node}`);
            console.log("PVE task status response:", JSON.stringify(statusResp, null, 2));

            if (statusResp && statusResp.data) {
                return {
                    upid: upid,
                    node: node,
                    status: statusResp.data.status,
                    type: statusResp.data.type,
                    user: statusResp.data.user,
                    starttime: statusResp.data.starttime,
                    endtime: statusResp.data.endtime,
                    exitstatus: statusResp.data.exitstatus,
                    progress: statusResp.data.progress || 0
                };
            }

            return {
                upid: upid,
                node: node,
                status: PVE_TASK_STATUS.STOPPED,
                type: 'unknown',
                user: 'unknown',
                starttime: 0,
                error: "No PVE task data found"
            };
        } catch (error) {
            console.error(`Error checking PVE task status for ${upid}:`, error);
            
            // 如果是 JSON 解析錯誤，特別處理
            if (error instanceof SyntaxError && error.message.includes('JSON')) {
                console.error(`JSON parsing error for task ${upid}:`, error.message);
                return {
                    upid: upid,
                    node: node,
                    status: PVE_TASK_STATUS.STOPPED,
                    type: 'unknown',
                    user: 'unknown',
                    starttime: 0,
                    error: `JSON parsing error: ${error.message}`
                };
            }

            return {
                upid: upid,
                node: node,
                status: PVE_TASK_STATUS.STOPPED,
                type: 'unknown',
                user: 'unknown',
                starttime: 0,
                error: "Failed to check PVE task status"
            };
        }
    }

    // 重新整理並更新任務狀態
    private async _refreshAndUpdateTaskStatus(task: any): Promise<any> {
        try {
            if (!task.steps || task.steps.length === 0 || !task.steps[0].pve_upid) {
                return task;
            }

            const pveStatus = await this._checkPVETaskStatus(task.target_node, task.steps[0].pve_upid);

            // 根據 PVE 狀態更新本地任務狀態
            if (pveStatus && !pveStatus.error) {
                let newStatus = task.status;
                let newProgress = task.progress;

                // 根據 PVE 狀態映射到本地狀態
                if (pveStatus.status === PVE_TASK_STATUS.RUNNING) {
                    newStatus = VM_Task_Status.IN_PROGRESS;
                    newProgress = pveStatus.progress || 0;
                } else if (pveStatus.status === PVE_TASK_STATUS.STOPPED) {
                    if (pveStatus.exitstatus === PVE_TASK_EXIT_STATUS.OK) {
                        newStatus = VM_Task_Status.COMPLETED;
                        newProgress = 100;
                    } else if (pveStatus.exitstatus === null) {
                        // 任務停止但沒有結果，保持當前狀態
                        newStatus = VM_Task_Status.IN_PROGRESS;
                    } else {
                        // exitstatus 是錯誤訊息字串
                        newStatus = VM_Task_Status.FAILED;
                    }
                }

                // 更新資料庫中的任務狀態
                if (newStatus !== task.status || newProgress !== task.progress) {
                    const updateData: any = {
                        status: newStatus,
                        progress: newProgress,
                        updated_at: new Date(),
                        'steps.0.step_status': newStatus,
                        'steps.0.step_end_time': pveStatus.endtime ? new Date(pveStatus.endtime * 1000) : undefined
                    };

                    // 如果任務失敗，保存錯誤訊息
                    if (newStatus === VM_Task_Status.FAILED && pveStatus.exitstatus && pveStatus.exitstatus !== PVE_TASK_EXIT_STATUS.OK) {
                        updateData['steps.0.error_message'] = pveStatus.exitstatus;
                    }

                    await VM_TaskModel.updateOne({ task_id: task.task_id }, updateData);

                    // 更新本地物件
                    task.status = newStatus;
                    task.progress = newProgress;
                    task.updated_at = new Date();
                    if (task.steps && task.steps[0]) {
                        task.steps[0].step_status = newStatus;
                        if (pveStatus.endtime) {
                            task.steps[0].step_end_time = new Date(pveStatus.endtime * 1000);
                        }
                    }
                }
            }

            return await this._getTaskWithPVEStatus(task);
        } catch (error) {
            console.error(`Error refreshing task status for ${task.task_id}:`, error);
            return task;
        }
    }

    // 清理舊任務記錄
    private async _cleanupOldTasks(): Promise<void> {
        try {
            const maxTaskAge = 30; // 保留最近30天的任務
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - maxTaskAge);

            const result = await VM_TaskModel.deleteMany({
                created_at: { $lt: cutoffDate }
            });

            console.log(`Cleaned up ${result.deletedCount} old tasks older than ${maxTaskAge} days`);
        } catch (error) {
            console.error("Error cleaning up old tasks:", error);
        }
    }

    // 清理特定用戶的舊任務
    private async _cleanupUserOldTasks(userId: string, maxTasks: number = 50): Promise<void> {
        try {
            // 保留用戶最近的 maxTasks 個任務，刪除其餘的
            const tasksToDelete = await VM_TaskModel.find({ user_id: userId })
                .sort({ created_at: -1 })
                .skip(maxTasks)
                .select('_id')
                .exec();

            if (tasksToDelete.length > 0) {
                const taskIds = tasksToDelete.map(task => task._id);
                const result = await VM_TaskModel.deleteMany({ _id: { $in: taskIds } });
                console.log(`Cleaned up ${result.deletedCount} old tasks for user ${userId}`);
            }
        } catch (error) {
            console.error(`Error cleaning up old tasks for user ${userId}:`, error);
        }
    }

    // 定期清理任務 - 可以設置為定時任務
    public async cleanupTasks(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<any>(Request);
            if (error) {
                console.error("Error validating token:", error);
                return error;
            }

            console.log("Starting task cleanup...");
            await this._cleanupOldTasks();

            // 統計清理後的任務數量
            const totalTasks = await VM_TaskModel.countDocuments();
            const tasksByStatus = await VM_TaskModel.aggregate([
                {
                    $group: {
                        _id: "$status",
                        count: { $sum: 1 }
                    }
                }
            ]);

            return createResponse(200, "Task cleanup completed", {
                totalTasks,
                tasksByStatus
            });
        } catch (error) {
            console.error("Error in cleanupTasks:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // 更新用戶擁有的 VM 列表 - 使用 VM table
    private async _updateUserOwnedVMs(userId: string, pve_vmid: string, pve_node: string): Promise<string> {
        try {
            // 先在 VM table 中創建或獲取 VM 記錄
            let vm = await VMModel.findOne({ pve_vmid: pve_vmid, pve_node: pve_node }).exec();
            
            if (!vm) {
                // 如果 VM 不存在，創建新的 VM 記錄
                vm = new VMModel({
                    pve_vmid: pve_vmid,
                    pve_node: pve_node,
                    owner: userId
                });
                await vm.save();
                logger.info(`Created new VM record: ${vm._id} for PVE VM ${pve_vmid} on node ${pve_node} with owner ${userId}`);
            }

            // 將 VM 的 _id 加入用戶的 owned_vms 列表
            await UsersModel.updateOne(
                { _id: userId },
                { $addToSet: { owned_vms: vm._id.toString() } }
            );
            
            logger.info(`Added VM ${vm._id} (PVE VM ${pve_vmid}) to user ${userId} owned_vms list`);
            return vm._id.toString();
        } catch (error) {
            logger.error(`Error updating user owned VMs for user ${userId}:`, error);
            throw error;
        }
    }

    // 清理失敗的 VM 創建 - 包含 VM table 清理
    private async _cleanupFailedVMCreation(userId: string, pve_vmid: string, pve_node: string, taskId: string): Promise<void> {
        try {
            logger.warn(`Starting cleanup for failed VM creation - User: ${userId}, PVE VM: ${pve_vmid}, Node: ${pve_node}, Task: ${taskId}`);
            
            // 1. 檢查 VM 是否存在於 VM table 中
            const vm = await VMModel.findOne({ pve_vmid: pve_vmid, pve_node: pve_node }).exec();
            if (vm) {
                // 2. 從用戶的 owned_vms 中移除 VM ID
                await UsersModel.updateOne(
                    { _id: userId },
                    { $pull: { owned_vms: vm._id.toString() } }
                );
                logger.info(`Removed VM ${vm._id} from user ${userId} owned_vms list`);

                // 3. 檢查是否有其他用戶擁有此 VM
                const otherOwners = await UsersModel.find({ 
                    owned_vms: vm._id.toString() 
                }).exec();

                // 4. 如果沒有其他用戶擁有此 VM，從 VM table 中刪除
                if (otherOwners.length === 0) {
                    await VMModel.deleteOne({ _id: vm._id });
                    logger.info(`Deleted VM ${vm._id} from VM table (no other owners)`);
                }
            }

            // 5. 檢查 VM 是否存在於 PVE 中並嘗試刪除
            try {
                const vmStatus: PVEResp = await callWithUnauthorized('GET', pve_api.nodes_qemu_config(pve_node, pve_vmid), undefined, {
                    headers: {
                        'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                    }
                });

                if (vmStatus && vmStatus.data) {
                    // VM 存在於 PVE 中，嘗試刪除
                    logger.info(`Attempting to delete failed PVE VM ${pve_vmid} from node ${pve_node}`);
                    
                    // 使用 DELETE 方法刪除 VM
                    const deleteResp: PVEResp = await callWithUnauthorized('DELETE', pve_api.nodes_qemu_vm(pve_node, pve_vmid), undefined, {
                        headers: {
                            'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                        }
                    });

                    if (deleteResp && deleteResp.data) {
                        logger.info(`Failed PVE VM ${pve_vmid} deletion task initiated with UPID: ${deleteResp.data}`);
                        
                        // 等待刪除完成
                        try {
                            const waitResult = await this._waitForTaskCompletion(pve_node, deleteResp.data, 'VM cleanup deletion');
                            if (waitResult.success) {
                                logger.info(`Successfully deleted failed VM ${pve_vmid} from PVE`);
                            } else {
                                logger.warn(`Failed to delete VM ${pve_vmid} from PVE: ${waitResult.errorMessage}`);
                            }
                        } catch (waitError) {
                            logger.error(`Error waiting for VM ${pve_vmid} deletion: ${waitError}`);
                        }
                    } else {
                        logger.info(`Failed PVE VM ${pve_vmid} deletion completed immediately`);
                    }
                } else {
                    logger.info(`VM ${pve_vmid} not found in PVE, may have been already deleted`);
                }
            } catch (deleteError) {
                logger.error(`Error deleting failed PVE VM ${pve_vmid}:`, deleteError);
                // 不拋出錯誤，繼續清理其他資源
            }

            // 6. 回滾已分配的資源使用量
            // 如果 VM 創建失敗，需要回滾已分配的資源
            if (vm) {
                try {
                    await this._reclaimVMResources(userId, pve_node, pve_vmid);
                    logger.info(`Reclaimed resources for failed VM creation: ${pve_vmid}`);
                } catch (resourceError) {
                    logger.error(`Error reclaiming resources for failed VM creation:`, resourceError);
                    // 不拋出錯誤，繼續清理流程
                }
            }

            // 7. 更新任務狀態為清理完成
            await VM_TaskModel.updateOne(
                { task_id: taskId },
                { 
                    status: VM_Task_Status.FAILED,
                    updated_at: new Date(),
                    error_message: "VM creation failed and cleanup completed"
                }
            );

            logger.info(`Cleanup completed for failed VM creation: ${pve_vmid}`);
            
        } catch (error) {
            logger.error(`Error during cleanup for failed VM creation:`, error);
            // 不拋出錯誤，避免影響主要的錯誤回應
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
                    console.log(`[deleteUserVM] Retrieved VM config for resource reclaim: cores=${vmConfig.cores}, memory=${vmConfig.memory}, disk size=${this._extractDiskSizeFromConfig(vmConfig.scsi0)}GB`);
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
                const waitResult = await this._waitForTaskCompletion(vm.pve_node, taskId as string, 'VM deletion');
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
            taskId
        };
    }

    // 從資料庫中清理 VM 記錄
    private async _cleanupVMFromDatabase(userId: string, vmId: string, vmConfig?: VMConfig | null, skipResourceReclaim: boolean = false): Promise<void> {
        try {
            // 只有在沒有跳過資源回收的情況下才回收資源
            if (!skipResourceReclaim) {
                // 如果有預先獲取的 VM 配置，使用它進行資源回收
                if (vmConfig) {
                    await this._reclaimVMResourcesWithConfig(userId, vmConfig);
                    logger.info(`Reclaimed resources using provided config for user ${userId}`);
                } else {
                    // 否則，先獲取 VM 資訊並回收資源
                    const vm = await VMModel.findById(vmId).exec();
                    if (vm) {
                        try {
                            await this._reclaimVMResources(userId, vm.pve_node, vm.pve_vmid);
                            logger.info(`Reclaimed resources for user ${userId} using VM lookup`);
                        } catch (resourceError) {
                            logger.error(`Error reclaiming resources for user ${userId}:`, resourceError);
                            // 不拋出錯誤，繼續清理流程
                        }
                    } else {
                        logger.warn(`VM ${vmId} not found for resource reclaim`);
                    }
                }
            } else {
                logger.info(`Skipping resource reclaim for user ${userId} as requested`);
            }

            // 從用戶的 owned_vms 中移除 VM
            await UsersModel.updateOne(
                { _id: userId },
                { $pull: { owned_vms: vmId } }
            );
            logger.info(`Removed VM ${vmId} from user ${userId} owned_vms list`);

            // 由於一台 VM 只有一個 owner，直接從 VM table 中刪除
            await VMModel.deleteOne({ _id: vmId });
            logger.info(`Deleted VM ${vmId} from VM table`);
        } catch (error) {
            logger.error(`Error cleaning up VM ${vmId} from database:`, error);
            throw error;
        }
    }

    // 從所有用戶中清理 VM 記錄（用於 superadmin 刪除任意 VM）
    private async _cleanupVMFromAllUsers(vmId: string): Promise<void> {
        try {
            // 在清理之前先獲取 VM 資訊以計算資源回收
            const vm = await VMModel.findById(vmId).exec();
            if (vm) {
                // 找到擁有此 VM 的用戶（一台 VM 只有一個 owner）
                const vmOwner = await UsersModel.findOne({ 
                    owned_vms: vmId 
                }).exec();

                // 為該用戶回收資源
                if (vmOwner) {
                    try {
                        await this._reclaimVMResources(vmOwner._id.toString(), vm.pve_node, vm.pve_vmid);
                        logger.info(`Reclaimed resources for VM owner ${vmOwner._id}`);
                    } catch (resourceError) {
                        logger.error(`Error reclaiming resources for user ${vmOwner._id}:`, resourceError);
                        // 不拋出錯誤，繼續清理流程
                    }
                } else {
                    logger.warn(`No owner found for VM ${vmId}`);
                }
            }

            // 從所有用戶的 owned_vms 中移除該 VM（清理任何可能的重複記錄）
            await UsersModel.updateMany(
                { owned_vms: vmId },
                { $pull: { owned_vms: vmId } }
            );
            logger.info(`Removed VM ${vmId} from all users' owned_vms lists`);

            // 從 VM table 中刪除 VM 記錄
            await VMModel.deleteOne({ _id: vmId });
            logger.info(`Deleted VM ${vmId} from VM table`);
        } catch (error) {
            logger.error(`Error cleaning up VM ${vmId} from all users:`, error);
            throw error;
        }
    }

    // 為普通用戶獲取基本 QEMU 配置（只包含必要資訊）
    private async _getBasicQemuConfig(node: string, vmid: string): Promise<resp<any>> {
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
            const basicConfig = {
                vmid: qemuConfig.data.vmid,
                name: qemuConfig.data.name,
                cores: qemuConfig.data.cores,
                memory: qemuConfig.data.memory,
                node: node,
                status: qemuConfig.data.status || 'stopped',
                // 只返回磁碟大小資訊，不包含詳細路徑
                disk_size: this._extractDiskSizeFromConfig(qemuConfig.data.scsi0)
            };

            return createResponse(200, "Basic QEMU config fetched successfully", basicConfig);
        } catch (error) {
            console.error("Error in _getBasicQemuConfig:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // 為管理員獲取詳細 QEMU 配置
    private async _getDetailedQemuConfig(node: string, vmid: string): Promise<resp<any>> {
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
            const detailedConfig = {
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
                disk_size: this._extractDiskSizeFromConfig(qemuConfig.data.scsi0)
            };

            return createResponse(200, "Detailed QEMU config fetched successfully", detailedConfig);
        } catch (error) {
            console.error("Error in _getDetailedQemuConfig:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // 為超級管理員獲取完整 QEMU 配置
    private async _getFullQemuConfig(node: string, vmid: string): Promise<resp<any>> {
        try {
            const qemuConfig: PVEResp = await callWithUnauthorized('GET', pve_api.nodes_qemu_config(node, vmid), undefined, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                }
            });

            if (!qemuConfig || !qemuConfig.data) {
                return createResponse(404, "QEMU config not found");
            }

            // 返回完整配置
            return createResponse(200, "Full QEMU config fetched successfully", qemuConfig.data);
        } catch (error) {
            console.error("Error in _getFullQemuConfig:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // 從 QEMU 配置中提取磁碟大小
    private _extractDiskSizeFromConfig(scsi0Config: string | undefined): number | null {
        if (!scsi0Config) return null;
        
        const sizeMatch = scsi0Config.match(/size=(\d+)G/);
        if (sizeMatch) {
            return parseInt(sizeMatch[1]);
        }
        return null;
    }

    // 獲取用戶擁有的 VM 列表
    public async getUserOwnedVMs(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetUser<any>(Request);
            if (error) {
                console.error("Error validating token:", error);
                return error;
            }

            if (!user.owned_vms || user.owned_vms.length === 0) {
                return createResponse(200, "No VMs found for user", []);
            }

            // 獲取用戶擁有的 VM 詳細資訊
            const vms = await VMModel.find({ 
                _id: { $in: user.owned_vms } 
            }).exec();

            // 為每個 VM 獲取基本狀態資訊
            const vmDetails = await Promise.all(
                vms.map(async (vm) => {
                    try {
                        const basicConfig = await this._getBasicQemuConfig(vm.pve_node, vm.pve_vmid);
                        return {
                            _id: vm._id,
                            pve_vmid: vm.pve_vmid,
                            pve_node: vm.pve_node,
                            config: basicConfig.code === 200 ? basicConfig.body : null,
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

    // 使用預先獲取的配置回收 VM 資源
    private async _reclaimVMResourcesWithConfig(userId: string, vmConfig: VMConfig): Promise<void> {
        try {
            // 提取要回收的資源配置
            const cpuCores = vmConfig.cores || 0;
            const memoryMB = parseInt(vmConfig.memory) || 0;
            const diskSizeGB = this._extractDiskSizeFromConfig(vmConfig.scsi0) || 0;
            
            if (cpuCores > 0 || memoryMB > 0 || diskSizeGB > 0) {
                // 獲取用戶資訊
                const user = await UsersModel.findById(userId).exec();
                if (!user) {
                    throw new Error(`User with ID ${userId} not found`);
                }

                let usedResourceId = user.used_compute_resource_id;
                if (!usedResourceId) {
                    logger.warn(`No used compute resource record found for user ${userId}, cannot reclaim resources`);
                    return;
                }

                // 獲取當前使用的資源
                const currentUsedResource = await UsedComputeResourceModel.findById(usedResourceId).exec();
                if (!currentUsedResource) {
                    logger.warn(`Used compute resource record ${usedResourceId} not found, cannot reclaim resources`);
                    return;
                }

                // 計算回收後的資源使用量（確保不會低於 0）
                const newCpuCores = Math.max(0, currentUsedResource.cpu_cores - cpuCores);
                const newMemory = Math.max(0, currentUsedResource.memory - memoryMB);
                const newStorage = Math.max(0, currentUsedResource.storage - diskSizeGB);

                // 更新資源使用量
                const result = await UsedComputeResourceModel.updateOne(
                    { _id: usedResourceId },
                    {
                        $set: {
                            cpu_cores: newCpuCores,
                            memory: newMemory,
                            storage: newStorage
                        }
                    }
                );

                if (result.matchedCount > 0) {
                    logger.info(`Reclaimed resources for user ${userId}: ${cpuCores} CPU cores, ${memoryMB} MB memory, ${diskSizeGB} GB storage`);
                    logger.info(`Updated resource usage for user ${userId}: ${newCpuCores} CPU cores, ${newMemory} MB memory, ${newStorage} GB storage`);
                } else {
                    throw new Error(`Failed to update compute resources for user ${userId}: resource record not found`);
                }
            } else {
                logger.warn(`No resources to reclaim for user ${userId}: cores=${cpuCores}, memory=${memoryMB}, disk=${diskSizeGB}`);
            }
        } catch (error) {
            logger.error(`Error reclaiming VM resources for user ${userId}:`, error);
            throw error;
        }
    }

    // 回收 VM 資源（從用戶的已使用資源中扣除）
    private async _reclaimVMResources(userId: string, pve_node: string, pve_vmid: string): Promise<void> {
        try {
            // 獲取 VM 的當前配置
            const vmConfig = await this._getCurrentVMConfig(pve_node, pve_vmid);
            if (!vmConfig) {
                logger.warn(`Cannot get VM config for ${pve_vmid} on node ${pve_node}, skipping resource reclaim`);
                return;
            }

            // 使用相同的邏輯回收資源
            await this._reclaimVMResourcesWithConfig(userId, vmConfig);
        } catch (error) {
            logger.error(`Error reclaiming VM resources for user ${userId}:`, error);
            throw error;
        }
    }

    // 獲取 VM 的當前配置
    private async _getCurrentVMConfig(pve_node: string, pve_vmid: string): Promise<VMConfig | null> {
        try {
            const configResp: PVEResp = await callWithUnauthorized('GET', pve_api.nodes_qemu_config(pve_node, pve_vmid), undefined, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_ADMINMODE_TOKEN}`
                }
            });

            if (configResp && configResp.data) {
                return configResp.data as VMConfig;
            }
            return null;
        } catch (error) {
            logger.error(`Error getting VM config for ${pve_vmid} on node ${pve_node}:`, error);
            return null;
        }
    }
}