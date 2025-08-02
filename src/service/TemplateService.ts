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
            const {user, error} = await validateTokenAndGetAdminUser<string>(Request);
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

            /*
            待實作
            */

            return createResponse(200, "Template submitted successfully", template._id?.toString());
        } catch (error) {
            console.error("Error in submitTemplate:", error);
            return createResponse(500, "Internal Server Error");
        }
    }
}
