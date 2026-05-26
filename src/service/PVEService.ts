import { Service } from "../abstract/Service";
import { resp, createResponse } from "../utils/resp";
import { PVEResp } from "../interfaces/Response/PVEResp";
import { Request } from "express";
import { getTokenRole, validateTokenAndGetAdminUser, validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { pve_api } from "../enum/PVE_API";
import { NodeStatus, PVE_NodeStatus } from '../interfaces/ApiEndPoints';
import { User } from "../interfaces/User";
import { pveClient } from "../modules/pve/PVEClient";
import { logger } from "../middlewares/log";
import { buildPVEDatacenterNodeStatus } from "../modules/pve/PVEDatacenterStatusPolicy";
import { pveTaskService } from "../modules/pve/PVETaskService";
import { PVEQemuConfigRole, pveQemuConfigAccessService } from "../modules/pve/PVEQemuConfigAccessService";


export class PVEService extends Service {

    public async getQemuConfig(Request: Request): Promise<resp<PVEResp | undefined>> {
        try {
            const token_role = (await getTokenRole(Request)).role;
            if (!this.isQemuConfigRole(token_role)) {
                return createResponse(403, "Invalid role");
            }

            const { user, error } = await this.validateQemuConfigUser(Request, token_role);
            if (error) {
                logger.error("Error validating token:", error);
                return error;
            }

            return await pveQemuConfigAccessService.getQemuConfig({
                role: token_role,
                user,
                vmId: Request.query.id
            }) as resp<PVEResp | undefined>;
        } catch (error) {
            logger.error("Error in getQemuConfig:", error);
            return createResponse(500, "Internal Server Error");
        }
    }


    public async getNodes(Request: Request): Promise<resp<PVEResp | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<PVEResp>(Request);
            if (error) {
                logger.error("Error validating token:", error);
                return error;
            }
            const nodes: PVEResp = await pveClient.request('GET', pve_api.nodes, undefined, { mode: 'admin' });
            return createResponse(200, "Nodes fetched successfully", nodes.data);
        } catch (error) {
            logger.error("Error in getNodes:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // 檢視多個 VM 任務狀態的自定義接口
    public async getMultipleTasksStatus(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                logger.error("Error validating token:", error);
                return error;
            }

            const { task_ids } = Request.body;
            return pveTaskService.getMultipleTasksStatus({ user, taskIds: task_ids });
        } catch (error) {
            logger.error("Error in getMultipleTasksStatus:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // 獲取用戶最新一筆的 VM 任務狀態
    public async getUserLatestTaskStatus(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                logger.error("Error validating token:", error);
                return error;
            }
            return pveTaskService.getUserLatestTaskStatus(user);
        } catch (error) {
            logger.error("Error in getUserLatestTaskStatus:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // 獲取用戶所有 VM 任務的狀態
    public async getUserAllTasksStatus(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                logger.error("Error validating token:", error);
                return error;
            }

            return pveTaskService.getUserAllTasksStatus({
                user,
                page: Request.query.page,
                limit: Request.query.limit,
                status: Request.query.status
            });
        } catch (error) {
            logger.error("Error in getUserAllTasksStatus:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // 即時檢查 PVE 任務狀態並更新本地記錄
    public async refreshTaskStatus(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                logger.error("Error validating token:", error);
                return error;
            }

            const { task_id } = Request.body;
            return pveTaskService.refreshTaskStatus({ user, taskId: task_id });
        } catch (error) {
            logger.error("Error in refreshTaskStatus:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // 定期清理任務 - 可以設置為定時任務
    public async cleanupTasks(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<User>(Request);
            if (error) {
                logger.error("Error validating token:", error);
                return error;
            }

            return pveTaskService.cleanupTasks();
        } catch (error) {
            logger.error("Error in cleanupTasks:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // 取得 PVE Datacenter 狀態
    public async getDatacenterStatus(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<User>(Request);
            if (error) {
                logger.error("Error validating token:", error);
                return error;
            }
            // 取得所有節點狀態
            const nodesResp: PVEResp = await pveClient.request('GET', pve_api.nodes);

            if (!nodesResp || !nodesResp.data) {
                return createResponse(404, "Nodes not found");
            }

            // datacenter overview 統計
            const nodes = nodesResp.data;
            let online = 0, offline = 0, total = nodes.length;
            let datacenter_cpu = 0, datacenter_maxcpu = 0;
            let datacenter_mem = 0, datacenter_maxmem = 0;
            let datacenter_disk = 0, datacenter_maxdisk = 0;
            const nodeList: NodeStatus[] = [];
            // 聚合共享(例如 NFS)存儲: 以 storage id 去重避免多節點重覆計入
            const sharedStorageMap = new Map<string, { total: number; used: number }>();
            let extra_local_total = 0;
            let extra_local_used = 0;
            const extraLocalList: { id: string; total: number; used: number; }[] = [];

            for (const node of nodes as PVE_NodeStatus[]) {
                const online_status: boolean = node.status === 'online';
                if (online_status) online++;
                else offline++;
                datacenter_cpu += node.cpu * node.maxcpu;
                datacenter_maxcpu += node.maxcpu;
                datacenter_mem += node.mem;
                datacenter_maxmem += node.maxmem;
                datacenter_disk += node.disk;
                datacenter_maxdisk += node.maxdisk;
                // 查詢節點 storage 列表 (僅當節點 online 才有意義)
                if (online_status && pve_api.nodes_storage) {
                    try {
                        const nodeStorageResp: PVEResp = await pveClient.request('GET', pve_api.nodes_storage(node.node));
                        if (nodeStorageResp && Array.isArray(nodeStorageResp.data)) {
                            for (const st of nodeStorageResp.data) {
                                const totalField = (typeof st.total === 'number') ? st.total : (typeof st.maxdisk === 'number' ? st.maxdisk : 0);
                                const usedField = (typeof st.used === 'number') ? st.used : (typeof st.disk === 'number' ? st.disk : 0);
                                if (!totalField || totalField <= 0) continue;
                                const sid = st.storage || st.name || st.volid || st.id;
                                if (!sid) continue;
                                // Shared storage (e.g., NFS)
                                if (st.shared === 1 || (st.type && ['nfs','cifs','glusterfs','cephfs','rbd','iscsi','iscsidirect'].includes(st.type))) {
                                    const prev = sharedStorageMap.get(sid) || { total: 0, used: 0 };
                                    prev.total = Math.max(prev.total, totalField);
                                    prev.used = Math.max(prev.used, usedField);
                                    sharedStorageMap.set(sid, prev);
                                    continue;
                                }
                                // Extra local storages (avoid double counting 'local' dir already covered by node.maxdisk)
                                if (st.shared === 0 && st.type && ['zfspool','lvmthin'].includes(st.type) && sid !== 'local') {
                                    extra_local_total += totalField;
                                    extra_local_used += usedField;
                                    extraLocalList.push({ id: sid, total: totalField, used: usedField });
                                }
                            }
                        }
                    } catch (e) {
                        logger.error(`Error fetching storage for node ${node.node}:`, e);
                    }
                }
                nodeList.push(buildPVEDatacenterNodeStatus(node));
            }
            // 加總共享存儲 (NFS 等) 到 datacenter
            let aggregated_shared_total = 0;
            let aggregated_shared_used = 0;
            for (const v of sharedStorageMap.values()) {
                aggregated_shared_total += v.total;
                aggregated_shared_used += v.used;
            }
            const storage_total = datacenter_maxdisk + aggregated_shared_total + extra_local_total;
            const storage_used = datacenter_disk + aggregated_shared_used + extra_local_used;

            // datacenter summary
            const datacenter = {
                cpu_total: datacenter_maxcpu,
                cpu_percent: datacenter_maxcpu > 0 ? Math.round((datacenter_cpu / datacenter_maxcpu) * 100) : 0,
                memory_total_gb: Math.round(datacenter_maxmem / 1024 / 1024 / 1024),
                memory_used_gb: Math.round(datacenter_mem / 1024 / 1024 / 1024),
                memory_percent: datacenter_maxmem > 0 ? Math.round((datacenter_mem / datacenter_maxmem) * 100) : 0,
                storage_used_tb: +(storage_used / Math.pow(1024, 4)).toFixed(2),
                storage_total_tb: +(storage_total / Math.pow(1024, 4)).toFixed(2),
                storage_percent: storage_total > 0 ? Math.round((storage_used / storage_total) * 100) : 0,
            };
            const overview = {
                total_nodes: total,
                online_nodes: online,
                offline_nodes: offline,
            };
            // 返回所有節點的狀態與 overview
            return createResponse(200, "Datacenter status fetched successfully", {
                overview,
                datacenter,
                nodes: nodeList
            });
        } catch (error) {
            logger.error("Error in getDatacenterStatus:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    private isQemuConfigRole(role: unknown): role is PVEQemuConfigRole {
        return role === "user" || role === "admin" || role === "superadmin";
    }

    private async validateQemuConfigUser(
        Request: Request,
        role: PVEQemuConfigRole
    ): Promise<{ user: User; error?: undefined } | { user?: undefined; error: resp<PVEResp | undefined> }> {
        if (role === "user") {
            return validateTokenAndGetUser<PVEResp>(Request);
        }

        if (role === "admin") {
            return validateTokenAndGetAdminUser<PVEResp>(Request);
        }

        return validateTokenAndGetSuperAdminUser<PVEResp>(Request);
    }
}
