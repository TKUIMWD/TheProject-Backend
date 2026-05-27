import { pve_api } from "../../enum/PVE_API";
import { PVEResp } from "../../interfaces/Response/PVEResp";
import { User } from "../../interfaces/User";
import { createResponse, resp } from "../../utils/resp";
import { PVEClient, pveClient } from "./PVEClient";
import { pveDatacenterStatusService } from "./PVEDatacenterStatusService";
import { PVEQemuConfigRole, pveQemuConfigAccessService } from "./PVEQemuConfigAccessService";
import { pveTaskService } from "./PVETaskService";
import { pveVMInventoryService } from "./PVEVMInventoryService";
import { pveStorageDetailsService } from "./PVEStorageDetailsService";
import { pveVMDetailService } from "./PVEVMDetailService";
import { pveVMOperationService } from "./PVEVMOperationService";
import { pveDashboardTrendService } from "./PVEDashboardTrendService";
import { pveVMBatchDeleteService } from "./PVEVMBatchDeleteService";

type PVERequestAdapterServiceDeps = {
    pve?: Pick<PVEClient, "request">;
    qemuConfigAccess?: {
        getQemuConfig(input: {
            role: PVEQemuConfigRole;
            user: User;
            vmId: unknown;
        }): Promise<resp<unknown>>;
    };
    taskService?: {
        getMultipleTasksStatus(input: { user: User; taskIds: unknown }): Promise<resp<any>>;
        getUserLatestTaskStatus(user: User): Promise<resp<any>>;
        getUserAllTasksStatus(input: {
            user: User;
            page?: unknown;
            limit?: unknown;
            status?: unknown;
        }): Promise<resp<any>>;
        refreshTaskStatus(input: { user: User; taskId: unknown }): Promise<resp<any>>;
        getRecentTasks(input: {
            page?: unknown;
            limit?: unknown;
            status?: unknown;
        }): Promise<resp<any>>;
        cleanupTasks(): Promise<resp<any>>;
    };
    datacenterStatus?: {
        getDatacenterStatus(): Promise<resp<any>>;
    };
    vmInventory?: {
        getVMInventory(): Promise<resp<any>>;
    };
    storageDetails?: {
        getStorageDetails(): Promise<resp<any>>;
    };
    vmDetail?: {
        getVMDetail(input: { node?: unknown; vmid?: unknown }): Promise<resp<any>>;
    };
    vmOperation?: {
        operateVM(input: { node?: unknown; vmid?: unknown; action?: unknown }): Promise<resp<any>>;
    };
    vmBatchDelete?: {
        deleteVMs(input: { targets?: unknown }): Promise<resp<any>>;
    };
    dashboardTrends?: {
        getDashboardTrends(input: { limit?: unknown }): Promise<resp<any>>;
    };
};

export class PVERequestAdapterService {
    private readonly pve: Pick<PVEClient, "request">;
    private readonly qemuConfigAccess: NonNullable<PVERequestAdapterServiceDeps["qemuConfigAccess"]>;
    private readonly taskService: NonNullable<PVERequestAdapterServiceDeps["taskService"]>;
    private readonly datacenterStatus: NonNullable<PVERequestAdapterServiceDeps["datacenterStatus"]>;
    private readonly vmInventory: NonNullable<PVERequestAdapterServiceDeps["vmInventory"]>;
    private readonly storageDetails: NonNullable<PVERequestAdapterServiceDeps["storageDetails"]>;
    private readonly vmDetail: NonNullable<PVERequestAdapterServiceDeps["vmDetail"]>;
    private readonly vmOperation: NonNullable<PVERequestAdapterServiceDeps["vmOperation"]>;
    private readonly vmBatchDelete: NonNullable<PVERequestAdapterServiceDeps["vmBatchDelete"]>;
    private readonly dashboardTrends: NonNullable<PVERequestAdapterServiceDeps["dashboardTrends"]>;

    constructor(deps: PVERequestAdapterServiceDeps = {}) {
        this.pve = deps.pve ?? pveClient;
        this.qemuConfigAccess = deps.qemuConfigAccess ?? pveQemuConfigAccessService;
        this.taskService = deps.taskService ?? pveTaskService;
        this.datacenterStatus = deps.datacenterStatus ?? pveDatacenterStatusService;
        this.vmInventory = deps.vmInventory ?? pveVMInventoryService;
        this.storageDetails = deps.storageDetails ?? pveStorageDetailsService;
        this.vmDetail = deps.vmDetail ?? pveVMDetailService;
        this.vmOperation = deps.vmOperation ?? pveVMOperationService;
        this.vmBatchDelete = deps.vmBatchDelete ?? pveVMBatchDeleteService;
        this.dashboardTrends = deps.dashboardTrends ?? pveDashboardTrendService;
    }

    public async getQemuConfig(input: {
        role: PVEQemuConfigRole;
        user: User;
        query: { id?: unknown };
    }): Promise<resp<unknown>> {
        return this.qemuConfigAccess.getQemuConfig({
            role: input.role,
            user: input.user,
            vmId: input.query.id
        });
    }

    public async getNodes(): Promise<resp<PVEResp["data"] | undefined>> {
        const nodes: PVEResp = await this.pve.request("GET", pve_api.nodes, undefined, { mode: "admin" });
        return createResponse(200, "Nodes fetched successfully", nodes.data);
    }

    public async getMultipleTasksStatus(input: {
        user: User;
        body: { task_ids?: unknown };
    }): Promise<resp<any>> {
        return this.taskService.getMultipleTasksStatus({
            user: input.user,
            taskIds: input.body.task_ids
        });
    }

    public async getUserLatestTaskStatus(input: {
        user: User;
    }): Promise<resp<any>> {
        return this.taskService.getUserLatestTaskStatus(input.user);
    }

    public async getUserAllTasksStatus(input: {
        user: User;
        query: {
            page?: unknown;
            limit?: unknown;
            status?: unknown;
        };
    }): Promise<resp<any>> {
        return this.taskService.getUserAllTasksStatus({
            user: input.user,
            page: input.query.page,
            limit: input.query.limit,
            status: input.query.status
        });
    }

    public async refreshTaskStatus(input: {
        user: User;
        body: { task_id?: unknown };
    }): Promise<resp<any>> {
        return this.taskService.refreshTaskStatus({
            user: input.user,
            taskId: input.body.task_id
        });
    }

    public async getRecentTasks(input: {
        query: {
            page?: unknown;
            limit?: unknown;
            status?: unknown;
        };
    }): Promise<resp<any>> {
        return this.taskService.getRecentTasks({
            page: input.query.page,
            limit: input.query.limit,
            status: input.query.status
        });
    }

    public async cleanupTasks(): Promise<resp<any>> {
        return this.taskService.cleanupTasks();
    }

    public async getDatacenterStatus(): Promise<resp<any>> {
        return this.datacenterStatus.getDatacenterStatus();
    }

    public async getVMInventory(): Promise<resp<any>> {
        return this.vmInventory.getVMInventory();
    }

    public async getStorageDetails(): Promise<resp<any>> {
        return this.storageDetails.getStorageDetails();
    }

    public async getVMDetail(input: {
        query: {
            node?: unknown;
            vmid?: unknown;
        };
    }): Promise<resp<any>> {
        return this.vmDetail.getVMDetail({
            node: input.query.node,
            vmid: input.query.vmid
        });
    }

    public async operateVM(input: {
        body: {
            node?: unknown;
            vmid?: unknown;
            action?: unknown;
        };
    }): Promise<resp<any>> {
        return this.vmOperation.operateVM({
            node: input.body.node,
            vmid: input.body.vmid,
            action: input.body.action
        });
    }

    public async deleteVMs(input: {
        body: {
            targets?: unknown;
        };
    }): Promise<resp<any>> {
        return this.vmBatchDelete.deleteVMs({
            targets: input.body.targets
        });
    }

    public async getDashboardTrends(input: {
        query: {
            limit?: unknown;
        };
    }): Promise<resp<any>> {
        return this.dashboardTrends.getDashboardTrends({
            limit: input.query.limit
        });
    }
}

export const pveRequestAdapterService = new PVERequestAdapterService();
