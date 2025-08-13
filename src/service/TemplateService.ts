import { Service } from "../abstract/Service";
import { resp, createResponse } from "../utils/resp";
import { Request } from "express";
import { validateTokenAndGetUser, validateTokenAndGetSuperAdminUser, validateTokenAndGetAdminUser } from "../utils/auth";
import { VMTemplateModel } from "../orm/schemas/VM/VMTemplateSchemas";
import { VM_Template_Info } from "../interfaces/VM/VM_Template";
import { UsersModel } from "../orm/schemas/UserSchemas";
import { PVE_qemu_config } from "../interfaces/PVE";
import { PVEUtils } from "../utils/PVEUtils";
import { VMUtils } from "../utils/VMUtils";
import { SubmittedTemplateModel } from "../orm/schemas/SubmittedTemplateSchemas";
import { SubmittedTemplateStatus, SubmittedTemplateDetails } from "../interfaces/SubmittedTemplate";
import { User } from "../interfaces/User";
import { sendTemplateAuditResultEmail } from "../utils/MailSender/TemplateAuditResultSender";

export class TemplateService extends Service {

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

                // 初始化模板資訊
                const templateInfo: VM_Template_Info = {
                    _id: template._id,
                    name: qemuConfig.name,
                    description: template.description,
                    submitted_date: template.submitted_date,
                    owner: template.owner,
                    is_public: template.is_public,
                    default_cpu_cores: PVEUtils.extractCpuCores(qemuConfig),
                    default_memory_size: PVEUtils.extractMemorySize(qemuConfig), // MB
                    default_disk_size: PVEUtils.extractDiskSize(qemuConfig) // GB
                };

                // 只有當 submitter_user_id 存在時才查詢並添加 submitter_user_info
                if (template.submitter_user_id) {
                    const submitterUser = await UsersModel.findById(template.submitter_user_id).exec();
                    if (submitterUser) {
                        templateInfo.submitter_user_info = {
                            username: submitterUser.username,
                            email: submitterUser.email
                        };
                    }
                }

                return templateInfo;
            });

            const vmTemplateInfos = await Promise.all(templateInfoPromises);
            return createResponse(200, "Templates fetched successfully", vmTemplateInfos);
        } catch (error) {
            console.error("Error in getAllTemplates:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async getAccessableTemplates(Request: Request): Promise<resp<VM_Template_Info[] | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<VM_Template_Info[]>(Request);
            if (error) {
                console.error("Error validating token:", error);
                return error;
            }

            const templates = await VMTemplateModel.find({
                $or: [
                    { is_public: true },
                    { owner: user._id }
                ]
            }).exec();
            if (templates.length === 0) {
                return createResponse(200, "No approved templates found", []);
            }

            const templateInfoPromises = templates.map(async (template): Promise<VM_Template_Info> => {
                const configResp = await this._getTemplateInfo(template.pve_node, template.pve_vmid);
                if (configResp.code !== 200 || !configResp.body) {
                    throw new Error(`Failed to get qemu config for template ${template._id}: ${configResp.message}`);
                }
                const qemuConfig = configResp.body;

                // 初始化模板資訊
                const templateInfo: VM_Template_Info = {
                    _id: template._id,
                    name: qemuConfig.name,
                    description: template.description,
                    submitted_date: template.submitted_date,
                    owner: template.owner,
                    is_public: template.is_public,
                    default_cpu_cores: PVEUtils.extractCpuCores(qemuConfig),
                    default_memory_size: PVEUtils.extractMemorySize(qemuConfig), // MB
                    default_disk_size: PVEUtils.extractDiskSize(qemuConfig) // GB
                };

                // 只有當 submitter_user_id 存在時才查詢並添加 submitter_user_info
                if (template.submitter_user_id) {
                    const submitterUser = await UsersModel.findById(template.submitter_user_id).exec();
                    if (submitterUser) {
                        templateInfo.submitter_user_info = {
                            username: submitterUser.username,
                            email: submitterUser.email
                        };
                    }
                }

                return templateInfo;
            });

            const vmTemplateInfos = await Promise.all(templateInfoPromises);
            return createResponse(200, "Approved templates fetched successfully", vmTemplateInfos);
        } catch (error) {
            console.error("Error in getAllApprovedTemplates:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // 私有輔助方法
    private async _getTemplateInfo(node: string, vmid: string): Promise<resp<PVE_qemu_config | undefined>> {
        try {
            const templateInfoResp = await VMUtils.getTemplateInfo(node, vmid);

            if (templateInfoResp.code !== 200 || !templateInfoResp.body) {
                return createResponse(templateInfoResp.code, templateInfoResp.message);
            }

            return createResponse(200, "Template info fetched successfully", templateInfoResp.body);
        } catch (error) {
            console.error(`Error in _getTemplateInfo for node ${node}, vmid ${vmid}:`, error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async convertVMtoTemplate(Request: Request): Promise<resp<string | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<string>(Request);
            if (error) {
                console.error("Error validating token:", error);
                return error;
            }

            const { vm_id, ciuser, cipassword, description, template_name } = Request.body;

            // 驗證必要參數
            if (!vm_id || !ciuser || !cipassword || !description) {
                return createResponse(400, "Missing required fields: vm_id, ciuser, cipassword, description");
            }

            // 驗證 CI 參數格式
            const validateResult = await VMUtils.validateVMCreationParams({
                template_id: "dummy", // 這裡用假值，因為我們主要驗證 ci 參數
                name: "dummy",
                target: "dummy",
                cpuCores: 1,
                memorySize: 1024,
                diskSize: 10,
                ciuser,
                cipassword
            });

            if (validateResult.code !== 200) {
                return createResponse(400, `CI validation failed: ${validateResult.message}`);
            }

            // 查找用戶擁有的 VM (使用 VM schema 的 _id)
            const VMModel = (await import("../orm/schemas/VM/VMSchemas")).VMModel;
            const ownedVM = await VMModel.findOne({
                _id: vm_id,
                owner: user._id
            }).exec();

            if (!ownedVM) {
                return createResponse(404, "VM not found or you don't have permission to convert this VM");
            }

            const node = ownedVM.pve_node;
            const vmid = ownedVM.pve_vmid;

            // 使用 VMUtils 檢查 VM 狀態
            const vmStatus = await VMUtils.getVMStatus(node, vmid);
            if (!vmStatus) {
                return createResponse(500, "Failed to get VM status");
            }

            if (vmStatus.status !== 'stopped') {
                return createResponse(400, "VM must be stopped before converting to template");
            }

            // 準備範本名稱（如果提供）
            let finalTemplateName: string | undefined = undefined;
            if (template_name && template_name.trim()) {
                const sanitizedName = PVEUtils.sanitizeVMName(template_name.trim());
                if (!sanitizedName) {
                    return createResponse(400, "Invalid template name: name contains invalid characters or is too long");
                }
                finalTemplateName = sanitizedName;
            }

            // 使用 VMUtils 將 VM 轉換為模板
            const convertResult = await VMUtils.convertVMToTemplate(node, vmid, finalTemplateName);

            if (!convertResult.success) {
                console.error("Failed to convert VM to template:", convertResult.errorMessage);
                return createResponse(500, `Failed to convert VM to template: ${convertResult.errorMessage}`);
            }

            // 如果轉換操作返回 UPID，等待任務完成
            if (convertResult.upid) {
                const waitResult = await VMUtils.waitForTaskCompletion(node, convertResult.upid, 'VM to template conversion');
                if (!waitResult.success) {
                    console.error("Template conversion task failed:", waitResult.errorMessage);
                    return createResponse(500, `Template conversion failed: ${waitResult.errorMessage}`);
                }
            }

            // 創建範本記錄
            const newTemplate = new VMTemplateModel({
                description,
                pve_vmid: vmid,
                pve_node: node,
                owner: user._id,
                ciuser,
                cipassword,
                is_public: false // 預設為私有範本
            });

            await newTemplate.save();

            // 從用戶的 owned_vms 列表中移除該 VM，並將新模板 ID 加入 owned_templates
            await UsersModel.updateOne(
                { _id: user._id },
                {
                    $pull: { owned_vms: vm_id },
                    $push: { owned_templates: newTemplate._id }
                }
            );

            // 從 owned VM 資料中移除
            await VMModel.deleteOne({ _id: ownedVM._id });

            return createResponse(200, "VM successfully converted to template", newTemplate._id?.toString());

        } catch (error) {
            console.error("Error in convertVMtoTemplate:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async submitTemplate(Request: Request): Promise<resp<string | undefined>> {
        // 提交範本的實現
        // required admin or superadmin privileges
        try {
            const { user, error } = await validateTokenAndGetAdminUser<string>(Request);
            if (error) {
                console.error("Error validating token:", error);
                return error;
            }
            const { template_id } = Request.body;
            if (!template_id) {
                return createResponse(400, "Missing required field: template_id");
            }
            // 查找範本
            const template = await VMTemplateModel.findById(template_id).exec();
            if (!template) {
                return createResponse(404, "Template not found");
            }

            const submittedTemplate = new SubmittedTemplateModel({
                status: SubmittedTemplateStatus.not_approved,
                template_id: template._id,
                submitter_user_id: user._id,
                submitted_date: new Date(),
            });
            await submittedTemplate.save();
            return createResponse(200, "Template submitted successfully", template._id?.toString());
        } catch (error) {
            console.error("Error in submitTemplate:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * 獲取所有提交的模板 (僅限 superadmin)
     */
    public async getAllSubmittedTemplates(request: Request): Promise<resp<SubmittedTemplateDetails[] | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<User>(request);
            if (error) {
                console.error("Error validating token:", error);
                return createResponse(error.code, error.message);
            }

            const submittedTemplates = await SubmittedTemplateModel.find({})
                .populate('submitter_user_id', 'username email')
                .sort({ submitted_date: -1 });

            if (!submittedTemplates || submittedTemplates.length === 0) {
                return createResponse(200, "No submitted templates found", []);
            }

            const templateDetailsPromises = submittedTemplates.map(async (submittedTemplate): Promise<SubmittedTemplateDetails> => {
                // 獲取實際的模板資料
                const template = await VMTemplateModel.findById(submittedTemplate.template_id).exec();
                if (!template) {
                    console.warn(`Template not found for submitted template ${submittedTemplate._id}`);
                    // 返回基本信息，但標記為找不到模板
                    // 查詢 submitter_user_id 的詳細資訊
                    let submitterUserInfo = { username: "", email: "" };
                    if (submittedTemplate.submitter_user_id) {
                        const submitterUser = await UsersModel.findById(submittedTemplate.submitter_user_id).exec();
                        console.log(submitterUser)
                        if (submitterUser) {
                            submitterUserInfo = {
                                username: submitterUser.username,
                                email: submitterUser.email
                            };
                        }
                    }
                    return {
                        _id: submittedTemplate._id,
                        status: submittedTemplate.status,
                        template_id: submittedTemplate.template_id,
                        submitter_user_id: submittedTemplate.submitter_user_id,
                        submitted_date: submittedTemplate.submitted_date,
                        status_updated_date: submittedTemplate.status_updated_date,
                        reject_reason: submittedTemplate.reject_reason,
                        template_name: "Template Not Found",
                        template_description: "Template data unavailable",
                        owner: "Unknown",
                        submitter_user_info: submitterUserInfo,
                        pve_vmid: "",
                        pve_node: "",
                        default_cpu_cores: 0,
                        default_memory_size: 0,
                        default_disk_size: 0,
                        cipassword: "",
                        ciuser: ""
                    };
                }

                // 獲取模板的 PVE 配置資訊
                const configResp = await this._getTemplateInfo(template.pve_node, template.pve_vmid);
                let qemuConfig: PVE_qemu_config | null = null;
                if (configResp.code === 200 && configResp.body) {
                    qemuConfig = configResp.body;
                }

                // 獲取擁有者資訊
                const ownerUser = await UsersModel.findById(template.owner).exec();

                // 獲取提交者資訊
                let submitterUserInfo = { username: "", email: "" };
                if (submittedTemplate.submitter_user_id) {
                    const submitterUser = await UsersModel.findById(submittedTemplate.submitter_user_id).exec();
                    if (submitterUser) {
                        submitterUserInfo = {
                            username: submitterUser.username,
                            email: submitterUser.email
                        };
                    }
                }

                return {
                    _id: submittedTemplate._id,
                    status: submittedTemplate.status,
                    template_id: submittedTemplate.template_id,
                    submitter_user_id: submittedTemplate.submitter_user_id,
                    submitted_date: submittedTemplate.submitted_date,
                    status_updated_date: submittedTemplate.status_updated_date,
                    reject_reason: submittedTemplate.reject_reason,
                    template_name: qemuConfig?.name || template.description || "Unnamed Template",
                    template_description: template.description,
                    owner: ownerUser?.username || "Unknown User",
                    submitter_user_info: submitterUserInfo,
                    pve_vmid: template.pve_vmid,
                    pve_node: template.pve_node,
                    default_cpu_cores: qemuConfig ? PVEUtils.extractCpuCores(qemuConfig) : 0,
                    default_memory_size: qemuConfig ? PVEUtils.extractMemorySize(qemuConfig) : 0,
                    default_disk_size: qemuConfig ? (PVEUtils.extractDiskSizeFromConfig(qemuConfig.scsi0 || "") || 0) : 0,
                    cipassword: template.cipassword || "",
                    ciuser: template.ciuser || ""
                };
            });

            const templateDetails = await Promise.all(templateDetailsPromises);
            return createResponse(200, "Submitted templates retrieved successfully", templateDetails);

        } catch (error) {
            console.error("Error in getAllSubmittedTemplates:", error);
            return createResponse(500, "Internal Server Error");
        }
    }


    public async auditSubmittedTemplate(request: Request): Promise<resp<string | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<User>(request);
            if (error) {
                console.error("Error validating token:", error);
                return createResponse(error.code, error.message);
            }

            const { template_id, status, reject_reason } = request.body;

            // 驗證必要參數
            if (!template_id || !status) {
                return createResponse(400, "Missing required fields: template_id, status");
            }

            // 驗證狀態
            if (![SubmittedTemplateStatus.approved, SubmittedTemplateStatus.rejected].includes(status)) {
                return createResponse(400, "Invalid status. Must be 'approved' or 'rejected'.");
            }

            // 查找提交的範本
            const submittedTemplate = await SubmittedTemplateModel.findById(template_id).exec();
            if (!submittedTemplate) {
                return createResponse(404, "Submitted template not found");
            }

            // 更新提交的範本狀態
            submittedTemplate.status = status;
            submittedTemplate.status_updated_date = new Date();
            if (status === SubmittedTemplateStatus.rejected) {
                submittedTemplate.reject_reason = reject_reason || "No reason provided";
            } else {
                submittedTemplate.reject_reason = undefined; // 清除拒絕原因
            }
            await submittedTemplate.save();

            // 如果範本被批准，則在 PVE 中克隆範本並在資料庫中建立新的資料
            if (status === SubmittedTemplateStatus.approved) {
                const originalTemplate = await VMTemplateModel.findById(submittedTemplate.template_id).exec();
                if (!originalTemplate) {
                    return createResponse(404, "Original template not found for the approved submission");
                }

                // 獲取下一個可用的 VM ID 作為新範本的 ID
                const nextIdResult = await VMUtils.getNextVMId();
                if (nextIdResult.code !== 200 || !nextIdResult.body) {
                    console.error(`Failed to get next VM ID for approved template: ${nextIdResult.message}`);
                    return createResponse(500, `Failed to get next VM ID: ${nextIdResult.message}`);
                }
                const newTemplateVmid = nextIdResult.body.data;

                // 使用 PVE API 克隆原始範本到新的 VM ID
                console.log(`Starting clone operation: source=${originalTemplate.pve_vmid} on ${originalTemplate.pve_node}, target=${newTemplateVmid}`);
                
                // 先獲取原始範本的配置信息以取得範本名稱
                const originalTemplateConfig = await VMUtils.getTemplateInfo(originalTemplate.pve_node, originalTemplate.pve_vmid);
                if (originalTemplateConfig.code !== 200 || !originalTemplateConfig.body) {
                    console.error(`Failed to get original template config: ${originalTemplateConfig.message}`);
                    return createResponse(500, `Failed to get original template config: ${originalTemplateConfig.message}`);
                }
                
                const originalTemplateName = originalTemplateConfig.body.name || originalTemplate.description;
                
                // 清理範本名稱以符合 DNS 格式要求，加入日期以識別
                const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD 格式
                const rawTemplateName = `${currentDate}-${originalTemplateName}`;
                const sanitizedTemplateName = PVEUtils.sanitizeVMName(rawTemplateName);
                if (!sanitizedTemplateName) {
                    console.error(`Failed to sanitize template name: ${rawTemplateName}`);
                    return createResponse(500, `Invalid template name format: ${rawTemplateName}`);
                }
                
                console.log(`Original template name: ${originalTemplateName}, sanitized new name: ${sanitizedTemplateName}`);
                
                const cloneResult = await VMUtils.cloneVM(
                    originalTemplate.pve_node,
                    originalTemplate.pve_vmid,
                    newTemplateVmid,
                    sanitizedTemplateName,
                    originalTemplate.pve_node, // 克隆到同一個節點
                    "NFS", // 預設存儲
                    "1" // 完整克隆
                );

                console.log(`Clone result:`, cloneResult);

                if (!cloneResult.success) {
                    console.error(`Failed to clone template in PVE: ${cloneResult.errorMessage}`);
                    return createResponse(500, `Failed to clone template in PVE: ${cloneResult.errorMessage}`);
                }

                // 等待克隆任務完成（如果有 UPID）
                if (cloneResult.upid) {
                    console.log(`Waiting for clone task completion with UPID: ${cloneResult.upid}`);
                    const waitResult = await VMUtils.waitForTaskCompletion(
                        originalTemplate.pve_node,
                        cloneResult.upid,
                        'Template clone for approval'
                    );
                    if (!waitResult.success) {
                        console.error("Template clone task failed:", waitResult.errorMessage);
                        return createResponse(500, `Template clone failed: ${waitResult.errorMessage}`);
                    }
                    console.log(`Clone task completed successfully`);
                } else {
                    // 沒有 UPID 可能表示操作立即完成，等待一段時間確保操作完成
                    console.log(`No UPID returned, assuming clone completed immediately. Waiting 3 seconds for safety...`);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    
                    // 驗證新的範本是否已經創建成功
                    try {
                        const newTemplateInfo = await VMUtils.getTemplateInfo(originalTemplate.pve_node, newTemplateVmid);
                        if (newTemplateInfo.code !== 200) {
                            console.error(`Failed to verify cloned template: ${newTemplateInfo.message}`);
                            return createResponse(500, `Clone operation completed but failed to verify new template: ${newTemplateInfo.message}`);
                        }
                        console.log(`Clone verification successful for template ${newTemplateVmid}`);
                    } catch (verifyError) {
                        console.error(`Error verifying cloned template:`, verifyError);
                        return createResponse(500, `Clone operation completed but verification failed`);
                    }
                }

                // 在資料庫中建立新的公開範本記錄
                const newApprovedTemplate = new VMTemplateModel({
                    description: `[Approved] ${originalTemplate.description}`,
                    pve_vmid: newTemplateVmid,
                    pve_node: originalTemplate.pve_node,
                    submitter_user_id: submittedTemplate.submitter_user_id,
                    submitted_date: submittedTemplate.submitted_date,
                    owner: user._id, // SuperAdmin 作為擁有者
                    ciuser: originalTemplate.ciuser,
                    cipassword: originalTemplate.cipassword,
                    is_public: true // 設置為公共範本
                });

                await newApprovedTemplate.save();

                // 將新範本 ID 加入 SuperAdmin 的 owned_templates
                await UsersModel.updateOne(
                    { _id: user._id },
                    { $addToSet: { owned_templates: newApprovedTemplate._id } }
                );

                console.log(`New approved template created with ID: ${newApprovedTemplate._id}, PVE VMID: ${newTemplateVmid}`);

                // 發送審核結果通知郵件給提交者
                const submitterUser = await UsersModel.findById(submittedTemplate.submitter_user_id).exec();
                if (submitterUser?.email) {
                    sendTemplateAuditResultEmail(submitterUser.email, originalTemplate.description, "approved");
                }
            } else if (status === SubmittedTemplateStatus.rejected) {
                // 發送拒絕通知郵件
                const toMail = (await UsersModel.findById(submittedTemplate.submitter_user_id).exec())?.email;
                if (toMail) {
                    sendTemplateAuditResultEmail(toMail, submittedTemplate.template_id, "rejected", reject_reason);
                }
            }

            return createResponse(200, "Template audit status updated successfully", submittedTemplate._id?.toString());
        } catch (error) {
            console.error("Error in auditSubmittedTemplate:", error);
            return createResponse(500, "Internal Server Error");
        }
    }
}
