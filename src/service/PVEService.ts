import { Service } from "../abstract/Service";
import { resp, createResponse } from "../utils/resp";
import { PVEResp } from "../interfaces/PVEResp";
import { Request } from "express";
import { getTokenRole, validateTokenAndGetAdminUser, validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { pve_api } from "../enum/PVE_API";
import { callWithUnauthorized } from "../utils/fetch";
import { PVE_node, PVE_template_info } from "../interfaces/PVE";
import { data } from "jquery";

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
                return createResponse(200, "QEMU config fetched successfully", qemuConfig);
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
            return createResponse(200, "Nodes fetched successfully", nodes);
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
            return createResponse(200, "Next ID fetched successfully", nextId);
        } catch (error) {
            console.error("Error in getNextId:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async getAllTemplates(Request: Request): Promise<resp<PVEResp | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<PVEResp>(Request);
            if (error) {
                console.error("Error validating token:", error);
                return error;
            }
            const nodes:PVEResp = await this._getNodes();
            if (nodes.error) {
                console.error("Error fetching nodes:", nodes.error);
                return nodes.error;
            }
            const nodesList:PVE_node[] = nodes.body.data || [];
            let templatesList:PVE_template_info[] = [];
            for (const node of nodesList) {
                const templates:PVEResp = await callWithUnauthorized('GET', pve_api.nodes_qemu(node.node), undefined, {
                    headers: {
                        'Authorization': `PVEAPIToken=${PVE_API_ADMINMODE_TOKEN}`
                    }
                });
                for (const template of templates.data) {
                    if (template.template) {
                        templatesList.push({
                            node: node.node,
                            vmid: template.vmid,
                            name: template.name
                        });
                    }
                }
            }

            return createResponse(200, "Templates fetched successfully", {data: templatesList});
        } catch (error) {
            console.error("Error in getAllTemplates:", error);
            return createResponse(500, "Internal Server Error");
        }
    }
}
