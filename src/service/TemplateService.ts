import { Service } from "../abstract/Service";
import { resp, createResponse } from "../utils/resp";
import { Request } from "express";
import { validateTokenAndGetUser, validateTokenAndGetSuperAdminUser } from "../utils/auth";
import { VMTemplateModel } from "../orm/schemas/VM/VMTemplateSchemas";
import { VM_Template_Info } from "../interfaces/VM/VM_Template";
import { UsersModel } from "../orm/schemas/UserSchemas";
import { PVE_qemu_config } from "../interfaces/PVE";
import { PVEResp } from "../interfaces/Response/PVEResp";
import { callWithUnauthorized } from "../utils/fetch";
import { pve_api } from "../enum/PVE_API";
import { PVEUtils } from "../utils/PVEUtils";

const PVE_API_USERMODE_TOKEN = process.env.PVE_API_USERMODE_TOKEN;

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

                const submitterUser = await UsersModel.findById(template.submitter_user_id).exec();
                if (!submitterUser) {
                    throw new Error(`User not found for ID: ${template.submitter_user_id}, template: ${template._id}`);
                }

                const templateInfo: VM_Template_Info = {
                    _id: template._id,
                    name: qemuConfig.name,
                    description: template.description,
                    submitted_date: template.submitted_date,
                    owner: template.owner,
                    is_public: template.is_public,
                    submitter_user_info: {
                        username: submitterUser.username,
                        email: submitterUser.email
                    },
                    default_cpu_cores: PVEUtils.extractCpuCores(qemuConfig),
                    default_memory_size: PVEUtils.extractMemorySize(qemuConfig), // MB
                    default_disk_size: PVEUtils.extractDiskSize(qemuConfig) // GB
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

                const submitterUser = await UsersModel.findById(template.submitter_user_id).exec();
                if (!submitterUser) {
                    throw new Error(`User not found for ID: ${template.submitter_user_id}, template: ${template._id}`);
                }

                const templateInfo: VM_Template_Info = {
                    _id: template._id,
                    name: qemuConfig.name,
                    description: template.description,
                    submitted_date: template.submitted_date,
                    owner: template.owner,
                    is_public: template.is_public,
                    submitter_user_info: {
                        username: submitterUser.username,
                        email: submitterUser.email
                    },
                    default_cpu_cores: PVEUtils.extractCpuCores(qemuConfig),
                    default_memory_size: PVEUtils.extractMemorySize(qemuConfig), // MB
                    default_disk_size: PVEUtils.extractDiskSize(qemuConfig) // GB
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

    // 私有輔助方法
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
}
