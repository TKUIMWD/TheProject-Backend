import { Service } from "../abstract/Service";
import { resp } from "../utils/resp";
import { PVEResp } from "../interfaces/PVEResp";
import { Request } from "express";
import { validateTokenAndGetAdminUser } from "../utils/auth";
import { pve_api } from "../enum/PVE_API";
import { asyncGet, asyncPost, asyncPut, asyncDelete, asyncPatch } from "../utils/fetch";

const PVE_API_ADMINMODE_TOKEN = process.env.PVE_API_ADMINMODE_TOKEN;
const PVE_API_SUPERADMINMODE_TOKEN = process.env.PVE_API_SUPERADMINMODE_TOKEN;
const PVE_API_USERMODE_TOKEN = process.env.PVE_API_USERMODE_TOKEN;

const callPVE = async (
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    url: string,
    body?: any,
    options: any = {}
) => {
    // 只對 PVE URL 臨時禁用 SSL 驗證
    const originalValue = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '1';
    try {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        
        switch (method) {
            case 'GET':
                return await asyncGet(url, options);
            case 'POST':
                return await asyncPost(url, body || {}, options);
            case 'PUT':
                return await asyncPut(url, body || {}, options);
            case 'DELETE':
                return await asyncDelete(url, body || {}, options);
            case 'PATCH':
                return await asyncPatch(url, body || {}, options);
            default:
                throw new Error(`Unsupported HTTP method: ${method}`);
        }
    } finally {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalValue;
    }
};


export class PVEService extends Service {
    public async getNodes(Request: Request): Promise<resp<PVEResp | undefined>> {
        const resp: resp<PVEResp | undefined> = {
            code: 200,
            message: "",
            body: undefined
        };
        try {
            const { user, error } = await validateTokenAndGetAdminUser<PVEResp>(Request);
            if (error) {
                console.error("Error validating token:", error);
                return error;
            }
            const nodes = await callPVE('GET', pve_api.nodes, undefined, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_ADMINMODE_TOKEN}`
                }
            });
            resp.body = nodes;
            resp.message = "Nodes fetched successfully";
            resp.code = 200;
        } catch (error) {
            resp.code = 500;
            resp.message = "Internal Server Error";
            resp.body = undefined;
            console.error("Error in getNodes:", error);
        }

        return resp;
    }
}
