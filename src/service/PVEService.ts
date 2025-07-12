import { Service } from "../abstract/Service";
import { resp } from "../utils/resp";
import { PVEResp } from "../interfaces/PVEResp";
import { Request } from "express";
import { validateTokenAndGetAdminUser } from "../utils/auth";
import { pve_api } from "../enum/PVE_API";
import { asyncGet } from "../utils/fetch";


const PVE_API_ADMINMODE_TOKEN = process.env.PVE_API_ADMINMODE_TOKEN;
const PVE_API_SUPERADMINMODE_TOKEN = process.env.PVE_API_SUPERADMINMODE_TOKEN;
const PVE_API_USERMODE_TOKEN = process.env.PVE_API_USERMODE_TOKEN;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // Disable SSL verification for PVE API calls


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
            const nodes = await asyncGet(pve_api.nodes, {
                headers: {
                    Authorization: `PVEAPIToken=${PVE_API_USERMODE_TOKEN}`
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
