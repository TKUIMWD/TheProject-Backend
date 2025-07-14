import { Service } from "../abstract/Service";
import { resp, createResponse } from "../utils/resp";
import { PVEResp } from "../interfaces/Response/PVEResp";
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
                const qemuConfig:PVEResp = await callWithUnauthorized('GET', pve_api.nodes_qemu_config(node, vmid), undefined, {
                    headers: {
                        'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                    }
                });
                if (!qemuConfig || !qemuConfig.data) {
                    return createResponse(404, "QEMU config not found");
                }
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
    // /nodes/{node}/qemu/{template_vmid}/clone
    public async createVMFromTemplate(Request: Request): Promise<resp<PVEResp | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<PVEResp>(Request);
            if (error) {
                console.error("Error validating token:", error);
                return error;
            }
            // template_id 是 VM_Template 的 _id ，用這查詢真實的 pve_vmid
            const newidRes = await this._getNextId();
            if (newidRes.code !== 200 || !newidRes.body) {
                console.error("Failed to get next ID:", newidRes.message);
                return createResponse(newidRes.code, newidRes.message);
            }
            const nextId = newidRes.body.data;
            const {template_id, name, target, storage="NFS" ,full='1', cpuCores, memorySize, diskSize } = Request.body;

            if (!template_id || !name || !target || !cpuCores || !memorySize || !diskSize) {
                const missingFields = [];
                if (!template_id) missingFields.push("template_id");
                if (!name) missingFields.push("name");
                if (!target) missingFields.push("target");
                if (!cpuCores) missingFields.push("cpuCores");
                if (!memorySize) missingFields.push("memorySize");
                if (!diskSize) missingFields.push("diskSize");
                return createResponse(400, `Missing required fields: ${missingFields.join(", ")}`);
            }

            // 驗證和清理 VM 名稱以符合 DNS 格式
            const sanitizedName = this.sanitizeVMName(name);
            if (!sanitizedName) {
                return createResponse(400, "Invalid VM name. Name must contain only alphanumeric characters, hyphens, and dots, and cannot start or end with a hyphen.");
            }

            // 查詢範本
            const template_info = await VMTemplateModel.findOne({ _id: template_id }).exec();
            if (!template_info) {
                return createResponse(404, "Template not found");
            }
            // 獲取範本的 pve_vmid 和 pve_node
            const template_vmid = template_info.pve_vmid;
            const template_node = template_info.pve_node;
            // 獲取範本的 qemu 配置
            const qemuConfigResp = await this._getTemplateInfo(template_node, template_vmid);
            if (qemuConfigResp.code !== 200 || !qemuConfigResp.body) {
                console.error(`Failed to get qemu config for template ${template_id}: ${qemuConfigResp.message}`);
                return createResponse(qemuConfigResp.code, qemuConfigResp.message);
            }            
            console.log(`Cloning template ${template_vmid} from node ${template_node} to ${target} with new ID ${nextId}`);
            
            // 檢查欲申請資源量是否符合資源限制

            return createResponse(400, "Resource limits checking not implemented yet");

            const cloneResp: PVEResp = await callWithUnauthorized('POST', pve_api.nodes_qemu_clone(template_node, template_vmid), {
                newid: nextId,
                name: sanitizedName,
                target: target,
                storage: storage,
                full: full,
            }, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                }
            });
            console.log("Clone Response:", cloneResp);
            
            if (!cloneResp || !cloneResp.data) {
                console.error("Clone operation failed:", cloneResp);
                return createResponse(500, "Failed to clone VM from template");
            }

            // 等待克隆任務完成後進行配置調整
            console.log("Clone task initiated, task ID:", cloneResp.data);

            // TODO: 實現配置調整
            // - CPU cores 調整
            // - Memory 調整 
            // - Disk 大小調整
            // - Network 配置

            return createResponse(200, "VM clone initiated successfully", {
                task_id: cloneResp.data,
                vm_name: sanitizedName,
            });
        } catch (error) {
            console.error("Error in createVMFromTemplate:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // 配置 VM 的 CPU 核心數
    private async _configureVMCores(node: string, vmid: string, cores: number): Promise<resp<PVEResp | undefined>> {
        try {
            const configResp: PVEResp = await callWithUnauthorized('PUT', pve_api.nodes_qemu_config(node, vmid), {
                cores: cores
            }, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_ADMINMODE_TOKEN}`
                }
            });
            return createResponse(200, "VM CPU cores configured successfully", configResp);
        } catch (error) {
            console.error(`Error configuring CPU cores for VM ${vmid}:`, error);
            return createResponse(500, "Failed to configure CPU cores");
        }
    }

    // 配置 VM 的記憶體大小
    private async _configureVMMemory(node: string, vmid: string, memory: number): Promise<resp<PVEResp | undefined>> {
        try {
            const configResp: PVEResp = await callWithUnauthorized('PUT', pve_api.nodes_qemu_config(node, vmid), {
                memory: memory
            }, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_ADMINMODE_TOKEN}`
                }
            });
            return createResponse(200, "VM memory configured successfully", configResp);
        } catch (error) {
            console.error(`Error configuring memory for VM ${vmid}:`, error);
            return createResponse(500, "Failed to configure memory");
        }
    }

    // 檢查任務狀態的輔助方法
    private async _checkTaskStatus(node: string, taskId: string): Promise<resp<PVEResp | undefined>> {
        try {
            // 注意：這需要在 PVE_API 中添加任務狀態查詢的端點
            // const taskResp: PVEResp = await callWithUnauthorized('GET', pve_api.nodes_tasks_status(node, taskId), undefined, {
            //     headers: {
            //         'Authorization': `PVEAPIToken=${PVE_API_ADMINMODE_TOKEN}`
            //     }
            // });
            // return createResponse(200, "Task status fetched successfully", taskResp);
            return createResponse(501, "Task status checking not implemented yet");
        } catch (error) {
            console.error(`Error checking task status ${taskId}:`, error);
            return createResponse(500, "Failed to check task status");
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
}
