import { Service } from "../abstract/Service";
import { resp, createResponse } from "../utils/resp";
import { PVEResp } from "../interfaces/PVEResp";
import { Request } from "express";
import { getTokenRole, validateTokenAndGetAdminUser, validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { pve_api } from "../enum/PVE_API";
import { callWithUnauthorized } from "../utils/fetch";
import { PVE_node, PVE_qemu_config } from "../interfaces/PVE";
import { VMTemplateModel } from "../orm/schemas/VMTemplateSchemas";
import { VM_Template, VM_Template_Info } from "../interfaces/VM_Template";
import { UsersModel } from "../orm/schemas/UserSchemas";
import { User } from "../interfaces/User";

const PVE_API_ADMINMODE_TOKEN = process.env.PVE_API_ADMINMODE_TOKEN;
const PVE_API_SUPERADMINMODE_TOKEN = process.env.PVE_API_SUPERADMINMODE_TOKEN;
const PVE_API_USERMODE_TOKEN = process.env.PVE_API_USERMODE_TOKEN;

const ALLOW_THE_TEST_ENDPOINT = true;


export class PVEService extends Service {

    // PVEService 私有方法，用於獲取集群下一個可用 ID
    // 在其他方法中調用此方法以獲取下一個 ID
    private async _getNextId(): Promise<resp<PVEResp | undefined>> {
        try {
            const nextId:PVEResp = await callWithUnauthorized('GET', pve_api.cluster_next_id, undefined, {
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

    private async _getNodes(): Promise<resp<PVEResp | undefined>> {
        try {
            const nodes:PVEResp = await callWithUnauthorized('GET', pve_api.nodes, undefined, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_ADMINMODE_TOKEN}`
                }
            });
            return createResponse(200, "Nodes fetched successfully", nodes);
        } catch (error) {
            console.error("Error in _getNodes:", error);
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
            const apiResponse: PVEResp = await callWithUnauthorized('GET', pve_api.qemu_config(node, vmid), undefined, {
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
        const token_role = (await getTokenRole(Request)).role;
        // role 為 user 時，僅允許訪問自己的虛擬機配置，並只提供必要的資訊
        // 如 CPU、RAM、磁碟等基本配置
        /*
        待實作細節
         */
        if (token_role === 'user' || token_role === 'admin') {
            return createResponse(403, "User and Admin role are not allowed to access this endpoint");
        }
        /*
        待實作細節
         */
        if (token_role === 'superadmin') {
            const { user, error } = await validateTokenAndGetSuperAdminUser<PVEResp>(Request);
            if (error) {
                console.error("Error validating token:", error);
                return error;
            }
            const { node, vmid } = Request.body;
            if (!node || !vmid) {
                return createResponse(400, "Missing node or vmid in request body");
            }
            try {
                const qemuConfig:PVEResp = await callWithUnauthorized('GET', pve_api.qemu_config(node, vmid), undefined, {
                    headers: {
                        'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                    }
                });
                return createResponse(200, "QEMU config fetched successfully", qemuConfig.data);
            } catch (error) {
                console.error("Error in getQemuConfig:", error);
                return createResponse(500, "Internal Server Error");
            }
        }

        return createResponse(200, "");
    }


    public async getNodes(Request: Request): Promise<resp<PVEResp | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<PVEResp>(Request);
            if (error) {
                console.error("Error validating token:", error);
                return error;
            }
            const nodes:PVEResp = await callWithUnauthorized('GET', pve_api.nodes, undefined, {
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

    public async getNextId(Request: Request): Promise<resp<PVEResp | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<PVEResp>(Request);
            if (error) {
                console.error("Error validating token:", error);
                return error;
            }
            const nextId:PVEResp = await callWithUnauthorized('GET', pve_api.cluster_next_id, undefined, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_ADMINMODE_TOKEN}`
                }
            });
            return createResponse(200, "Next ID fetched successfully", nextId.data);
        } catch (error) {
            console.error("Error in getNextId:", error);
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
}
