import { Service } from "../abstract/Service";
import { resp, createResponse } from "../utils/resp";
import { Request } from "express";
import { validateTokenAndGetUser, validateTokenAndGetSuperAdminUser } from "../utils/auth";
import { VMTemplateModel } from "../orm/schemas/VM/VMTemplateSchemas";
import { UsersModel } from "../orm/schemas/UserSchemas";
import { UsedComputeResourceModel } from "../orm/schemas/UsedComputeResourceSchemas";
import { VM_TaskModel } from "../orm/schemas/VM/VM_TaskSchemas";
import { VMUtils } from "../utils/VMUtils";
import { PVEUtils } from "../utils/PVEUtils";
import { User } from "../interfaces/User";
import { VMConfig } from "../interfaces/VM/VM";
import { VM_Task, VM_Task_Status } from "../interfaces/VM/VM_Task";
import { logger } from "../middlewares/log";
import { CloneTemplateResponse } from "../interfaces/Response/VMResp";



export class TemplateManageService extends Service {

    /**
     * 創建模板克隆任務追蹤
     */
    private async _createCloneTemplateTask(sourceTemplateId: string, userId: string, newVmid: string, sourceVmid: string, targetNode: string): Promise<VM_Task> {
        const task: VM_Task = {
            task_id: `clone-template-${sourceTemplateId}-${new Date().getTime()}-${userId}`,
            user_id: userId,
            vmid: newVmid,
            template_vmid: sourceVmid,
            target_node: targetNode,
            status: VM_Task_Status.PENDING,
            progress: 0,
            created_at: new Date(),
            updated_at: new Date(),
            steps: [
                {
                    step_name: "Clone Template to VM",
                    pve_upid: "PENDING",
                    step_status: VM_Task_Status.PENDING,
                    step_message: "",
                    step_start_time: new Date(),
                    step_end_time: undefined,
                    error_message: ""
                },
                {
                    step_name: "Convert VM to Template",
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

    /**
     * 更新模板配置
     */
    public async updateTemplateConfig(Request: Request): Promise<resp<string | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                console.error("Error validating token:", error);
                return createResponse(error.code, error.message);
            }

            const { template_id, description, is_public, template_name, ciuser, cipassword } = Request.body;

            // 驗證必要參數
            if (!template_id) {
                return createResponse(400, "Missing required field: template_id");
            }

            // 查找模板
            const template = await VMTemplateModel.findById(template_id).exec();
            if (!template) {
                return createResponse(404, "Template not found");
            }

            // 檢查基本權限 - 只有模板擁有者或 superadmin 可以更新
            if (template.owner !== user._id.toString() && user.role !== 'superadmin') {
                return createResponse(403, "Access denied: You don't have permission to update this template");
            }

            // 檢查 is_public 權限 - 只有 superadmin 可以修改
            if (is_public !== undefined && user.role !== 'superadmin') {
                return createResponse(403, "Access denied: Only superadmin can modify template public status");
            }

            // 準備更新數據
            const updateData: any = {};
            
            // 擁有者和 superadmin 都可以修改這些字段
            if (description !== undefined) {
                updateData.description = description;
            }

            // 檢查 ci user 和 ci password 是否同時存在或同時為空（如果提供的話）
            if (ciuser !== undefined || cipassword !== undefined) {
                const ciuserProvided = ciuser !== undefined && ciuser !== '';
                const cipasswordProvided = cipassword !== undefined && cipassword !== '';
                const ciuserEmpty = ciuser !== undefined && ciuser === '';
                const cipasswordEmpty = cipassword !== undefined && cipassword === '';
                
                // 必須兩者都有值，任一為 undefined 或空字串都不允許
                if (!(ciuser && cipassword)) {
                    return createResponse(400, "Both ciuser and cipassword must be provided and non-empty");
                }
                if (!((ciuserProvided && cipasswordProvided) || (ciuserEmpty && cipasswordEmpty))) {
                    return createResponse(400, "Both ciuser and cipassword must be provided together with values, or both must be empty strings");
                }

                updateData.ciuser = ciuser;
                updateData.cipassword = cipassword;
            }

            // 只有 superadmin 可以修改 is_public
            if (is_public !== undefined && user.role === 'superadmin') {
                updateData.is_public = is_public;
            }

            // 如果要更新模板名稱，需要通過 PVE API 更新
            if (template_name && template_name.trim()) {
                const sanitizedName = PVEUtils.sanitizeVMName(template_name.trim());
                if (!sanitizedName) {
                    return createResponse(400, "Invalid template name: name contains invalid characters or is too long");
                }

                // 使用 VMUtils 更新 PVE 中的模板名稱
                const nameUpdateResult = await VMUtils.updateVMName(template.pve_node, template.pve_vmid, sanitizedName);
                if (!nameUpdateResult.success) {
                    return createResponse(500, `Failed to update template name: ${nameUpdateResult.errorMessage}`);
                }

                // 如果有 UPID，等待任務完成
                if (nameUpdateResult.upid) {
                    const waitResult = await VMUtils.waitForTaskCompletion(template.pve_node, nameUpdateResult.upid, 'Template name update');
                    if (!waitResult.success) {
                        return createResponse(500, `Template name update failed: ${waitResult.errorMessage}`);
                    }
                }
            }

            // 如果要更新 CI 配置，需要通過 PVE API 更新
            if (ciuser !== undefined || cipassword !== undefined) {
                console.log(`[updateTemplateConfig] Updating CI config: ciuser="${ciuser ? '[PROVIDED]' : '[EMPTY]'}", cipassword="${cipassword ? '[PROVIDED]' : '[EMPTY]'}"`);

                // 使用 VMUtils 更新 PVE 中的 Cloud-Init 配置
                const ciUpdateResult = await VMUtils.configureCloudInit(template.pve_node, template.pve_vmid, ciuser, cipassword);
                if (!ciUpdateResult.success) {
                    return createResponse(500, `Failed to update template CI configuration: ${ciUpdateResult.errorMessage}`);
                }

                // 如果有 UPID，等待任務完成
                if (ciUpdateResult.upid) {
                    const waitResult = await VMUtils.waitForTaskCompletion(template.pve_node, ciUpdateResult.upid, 'Template CI configuration update');
                    if (!waitResult.success) {
                        return createResponse(500, `Template CI configuration update failed: ${waitResult.errorMessage}`);
                    }
                }
            }

            // 更新資料庫記錄
            if (Object.keys(updateData).length > 0) {
                await VMTemplateModel.updateOne({ _id: template_id }, updateData);
            }

            return createResponse(200, "Template configuration updated successfully", template_id);

        } catch (error) {
            console.error("Error in updateTemplateConfig:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * 刪除模板
     */
    public async deleteTemplate(Request: Request): Promise<resp<string | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                console.error("Error validating token:", error);
                return createResponse(error.code, error.message);
            }

            const { template_id } = Request.body;

            // 驗證必要參數
            if (!template_id) {
                return createResponse(400, "Missing required field: template_id");
            }

            // 查找模板
            const template = await VMTemplateModel.findById(template_id).exec();
            if (!template) {
                return createResponse(404, "Template not found");
            }

            // 檢查權限 - 只有模板擁有者或 superadmin 可以刪除
            if (template.owner !== user._id.toString() && user.role !== 'superadmin') {
                return createResponse(403, "Access denied: You don't have permission to delete this template");
            }

            // 在刪除模板之前，先獲取其配置用於資源回收
            let templateConfig: VMConfig | null = null;
            try {
                // 先檢查模板是否存在於 PVE 中
                console.log(`[deleteTemplate] Checking template existence in PVE: node=${template.pve_node}, vmid=${template.pve_vmid}`);
                templateConfig = await VMUtils.getCurrentVMConfig(template.pve_node, template.pve_vmid);
                if (templateConfig) {
                    console.log(`[deleteTemplate] Retrieved template config for resource reclaim: cores=${templateConfig.cores}, memory=${templateConfig.memory}, disk size=${PVEUtils.extractDiskSizeFromConfig(templateConfig.scsi0)}GB`);
                    console.log(`[deleteTemplate] Template config:`, JSON.stringify(templateConfig, null, 2));
                }
            } catch (configError) {
                logger.warn(`[deleteTemplate] Failed to get template config for resource reclaim: ${configError}`);
                console.log(`[deleteTemplate] Template may not exist in PVE or is inaccessible`);
                // 繼續執行刪除流程，但無法進行資源回收
            }

            try {
                // 使用標準的 PVE API DELETE 方法刪除模板
                const deleteResult = await VMUtils.deleteTemplate(template.pve_node, template.pve_vmid);
                
                if (!deleteResult.success) {
                    return createResponse(500, `Failed to delete template from PVE: ${deleteResult.errorMessage}`);
                }

                // 如果有 UPID，等待任務完成
                if (deleteResult.upid) {
                    console.log(`[deleteTemplate] Waiting for deletion task completion, UPID: ${deleteResult.upid}`);
                    
                    const waitResult = await VMUtils.waitForTaskCompletion(template.pve_node, deleteResult.upid, 'Template deletion');
                    console.log(`[deleteTemplate] Wait result:`, JSON.stringify(waitResult, null, 2));
                    
                    if (!waitResult.success) {
                        return createResponse(500, `Template deletion failed: ${waitResult.errorMessage}`);
                    }
                    
                    console.log(`[deleteTemplate] Template deletion task completed successfully`);
                } else {
                    console.log(`[deleteTemplate] Template deletion completed immediately (no UPID)`);
                }

            } catch (pveError) {
                console.error("Error deleting template from PVE:", pveError);
                return createResponse(500, `Failed to delete template from PVE system: ${pveError instanceof Error ? pveError.message : 'Unknown error'}`);
            }

            // 回收資源 - 使用之前獲取的配置
            if (templateConfig) {
                try {
                    await this._reclaimTemplateResourcesWithConfig(template.owner, templateConfig);
                    logger.info(`[deleteTemplate] Successfully reclaimed resources for user ${template.owner}`);
                } catch (resourceError) {
                    logger.error(`[deleteTemplate] Error reclaiming resources for user ${template.owner}:`, resourceError);
                    // 不影響刪除流程，繼續執行
                }
            } else {
                logger.warn(`[deleteTemplate] No template config available for resource reclaim`);
            }

            // 從用戶的 owned_templates 列表中移除
            await UsersModel.updateOne(
                { _id: template.owner },
                { $pull: { owned_templates: template_id } }
            );

            // 從資料庫中刪除模板記錄
            await VMTemplateModel.deleteOne({ _id: template_id });

            return createResponse(200, "Template deleted successfully", template_id);

        } catch (error) {
            console.error("Error in deleteTemplate:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * 克隆模板到新模板 (僅限 superadmin)
     */
    public async cloneTemplate(Request: Request): Promise<resp<CloneTemplateResponse | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<User>(Request);
            if (error) {
                console.error("Error validating token:", error);
                return createResponse(error.code, error.message);
            }

            const { template_id, new_template_name, description, target_node = "gapveb", storage = "NFS" } = Request.body;

            // 驗證必要參數
            if (!template_id || !new_template_name || !description) {
                return createResponse(400, "Missing required fields: template_id, new_template_name, description");
            }

            // 查找源模板
            const sourceTemplate = await VMTemplateModel.findById(template_id).exec();
            if (!sourceTemplate) {
                return createResponse(404, "Source template not found");
            }


            // 清理新模板名稱
            const sanitizedName = PVEUtils.sanitizeVMName(new_template_name.trim());
            if (!sanitizedName) {
                return createResponse(400, "Invalid template name: name contains invalid characters or is too long");
            }

            // 獲取下一個可用的 VM ID
            const nextIdResp = await VMUtils.getNextVMId();
            if (nextIdResp.code !== 200 || !nextIdResp.body?.data) {
                return createResponse(500, "Failed to get next VM ID");
            }
            const newVmid = nextIdResp.body.data.toString();

            // 確定目標節點
            const finalTargetNode = target_node || sourceTemplate.pve_node;

            // 創建任務追蹤
            const task = await this._createCloneTemplateTask(template_id, user._id.toString(), newVmid, sourceTemplate.pve_vmid, finalTargetNode);

            try {
                // Step 1: 克隆模板 (使用 clone API)
                await VM_TaskModel.updateOne(
                    { task_id: task.task_id, 'steps.0.step_name': 'Clone Template to VM' },
                    {
                        $set: {
                            status: VM_Task_Status.IN_PROGRESS,
                            progress: 25,
                            'steps.0.step_status': VM_Task_Status.IN_PROGRESS,
                            'steps.0.step_start_time': new Date(),
                            'steps.0.step_message': 'Starting template clone process'
                        }
                    }
                );

                const cloneResult = await VMUtils.cloneVM(
                    sourceTemplate.pve_node,
                    sourceTemplate.pve_vmid,
                    newVmid,
                    sanitizedName,
                    finalTargetNode,
                    storage,
                    "1" // full clone
                );

                if (!cloneResult.success) {
                    await VM_TaskModel.updateOne(
                        { task_id: task.task_id },
                        {
                            $set: {
                                status: VM_Task_Status.FAILED,
                                'steps.0.step_status': VM_Task_Status.FAILED,
                                'steps.0.step_end_time': new Date(),
                                'steps.0.error_message': cloneResult.errorMessage
                            }
                        }
                    );
                    return createResponse(500, `Failed to clone template: ${cloneResult.errorMessage}`);
                }

                // 更新任務狀態
                if (cloneResult.upid) {
                    await VM_TaskModel.updateOne(
                        { task_id: task.task_id, 'steps.0.step_name': 'Clone Template to VM' },
                        {
                            $set: {
                                'steps.0.pve_upid': cloneResult.upid,
                                'steps.0.step_message': 'Clone task submitted to PVE'
                            }
                        }
                    );
                }

                // 等待克隆任務完成
                if (cloneResult.upid) {
                    const waitResult = await VMUtils.waitForTaskCompletion(sourceTemplate.pve_node, cloneResult.upid, 'Template clone');
                    if (!waitResult.success) {
                        await VM_TaskModel.updateOne(
                            { task_id: task.task_id },
                            {
                                $set: {
                                    status: VM_Task_Status.FAILED,
                                    'steps.0.step_status': VM_Task_Status.FAILED,
                                    'steps.0.step_end_time': new Date(),
                                    'steps.0.error_message': waitResult.errorMessage
                                }
                            }
                        );
                        return createResponse(500, `Template cloning failed: ${waitResult.errorMessage}`);
                    }
                }

                // Step 1 完成
                await VM_TaskModel.updateOne(
                    { task_id: task.task_id, 'steps.0.step_name': 'Clone Template to VM' },
                    {
                        $set: {
                            progress: 50,
                            'steps.0.step_status': VM_Task_Status.COMPLETED,
                            'steps.0.step_end_time': new Date(),
                            'steps.0.step_message': 'Template clone completed successfully'
                        }
                    }
                );

                // Step 2: 將克隆的 VM 轉換為模板
                await VM_TaskModel.updateOne(
                    { task_id: task.task_id, 'steps.1.step_name': 'Convert VM to Template' },
                    {
                        $set: {
                            progress: 75,
                            'steps.1.step_status': VM_Task_Status.IN_PROGRESS,
                            'steps.1.step_start_time': new Date(),
                            'steps.1.step_message': 'Converting cloned VM to template'
                        }
                    }
                );

                const convertResult = await VMUtils.convertVMToTemplate(finalTargetNode, newVmid);
                if (!convertResult.success) {
                    await VM_TaskModel.updateOne(
                        { task_id: task.task_id },
                        {
                            $set: {
                                status: VM_Task_Status.FAILED,
                                'steps.1.step_status': VM_Task_Status.FAILED,
                                'steps.1.step_end_time': new Date(),
                                'steps.1.error_message': convertResult.errorMessage
                            }
                        }
                    );
                    // 如果轉換失敗，嘗試清理克隆的 VM
                    await VMUtils.deleteVMWithDiskCleanup(finalTargetNode, newVmid);
                    return createResponse(500, `Failed to convert cloned VM to template: ${convertResult.errorMessage}`);
                }

                // 更新任務狀態
                if (convertResult.upid) {
                    await VM_TaskModel.updateOne(
                        { task_id: task.task_id, 'steps.1.step_name': 'Convert VM to Template' },
                        {
                            $set: {
                                'steps.1.pve_upid': convertResult.upid,
                                'steps.1.step_message': 'Template conversion task submitted to PVE'
                            }
                        }
                    );
                }

                // 如果轉換有 UPID，等待完成
                if (convertResult.upid) {
                    const waitResult = await VMUtils.waitForTaskCompletion(finalTargetNode, convertResult.upid, 'Template conversion');
                    if (!waitResult.success) {
                        await VM_TaskModel.updateOne(
                            { task_id: task.task_id },
                            {
                                $set: {
                                    status: VM_Task_Status.FAILED,
                                    'steps.1.step_status': VM_Task_Status.FAILED,
                                    'steps.1.step_end_time': new Date(),
                                    'steps.1.error_message': waitResult.errorMessage
                                }
                            }
                        );
                        return createResponse(500, `Template conversion failed: ${waitResult.errorMessage}`);
                    }
                }

                // Step 2 完成
                await VM_TaskModel.updateOne(
                    { task_id: task.task_id, 'steps.1.step_name': 'Convert VM to Template' },
                    {
                        $set: {
                            'steps.1.step_status': VM_Task_Status.COMPLETED,
                            'steps.1.step_end_time': new Date(),
                            'steps.1.step_message': 'Template conversion completed successfully'
                        }
                    }
                );

            } catch (error) {
                console.error("Error during template cloning process:", error);
                await VM_TaskModel.updateOne(
                    { task_id: task.task_id },
                    {
                        $set: {
                            status: VM_Task_Status.FAILED,
                            updated_at: new Date()
                        }
                    }
                );
                return createResponse(500, "Template cloning process failed");
            }

            // 創建新的模板記錄
            const newTemplate = new VMTemplateModel({
                description,
                pve_vmid: newVmid,
                pve_node: finalTargetNode,
                owner: user._id,
                ciuser: sourceTemplate.ciuser, // 繼承源模板的 CI 配置
                cipassword: sourceTemplate.cipassword,
                is_public: false // 新克隆的模板預設為私有
            });

            await newTemplate.save();

            // 將新模板 ID 加入用戶的 owned_templates
            await UsersModel.updateOne(
                { _id: user._id },
                { $push: { owned_templates: newTemplate._id } }
            );

            // 最終完成任務
            await VM_TaskModel.updateOne(
                { task_id: task.task_id },
                {
                    $set: {
                        status: VM_Task_Status.COMPLETED,
                        progress: 100,
                        updated_at: new Date()
                    }
                }
            );

            return createResponse(200, "Template cloned successfully", {
                template_id: newTemplate._id?.toString() || "",
                task_id: task.task_id
            });

        } catch (error) {
            console.error("Error in cloneTemplate:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * 使用模板配置回收資源
     */
    private async _reclaimTemplateResourcesWithConfig(userId: string, templateConfig: VMConfig): Promise<void> {
        try {
            const user = await UsersModel.findById(userId).exec();
            if (!user || !user.used_compute_resource_id) {
                logger.error(`User ${userId} not found or no used compute resource ID`);
                return;
            }

            const diskSize = PVEUtils.extractDiskSizeFromConfig(templateConfig.scsi0);

            await UsedComputeResourceModel.updateOne(
                { _id: user.used_compute_resource_id },
                {
                    $inc: {
                        cpu_cores: -templateConfig.cores,
                        memory: -templateConfig.memory,
                        storage: diskSize ? -diskSize : 0
                    }
                }
            );

            logger.info(`Successfully reclaimed template resources for user ${userId}: CPU=${templateConfig.cores}, Memory=${templateConfig.memory}MB, Disk=${diskSize}GB`);
        } catch (error) {
            logger.error(`Error reclaiming template resources for user ${userId}:`, error);
            throw error;
        }
    }
}
