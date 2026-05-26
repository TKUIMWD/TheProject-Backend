import { Service } from "../abstract/Service";
import { User } from "../interfaces/User";
import { PVEResp } from "../interfaces/Response/PVEResp";
import { PVEQemuConfigRole } from "../modules/pve/PVEQemuConfigAccessService";
import { pveRequestAdapterService } from "../modules/pve/PVERequestAdapterService";
import { resp } from "../utils/resp";

export type PVEServiceAdapterInput = { user: User; body?: any; query?: Record<string, any> };

export class PVEService extends Service {
    public async getQemuConfig(input: PVEServiceAdapterInput & { role: PVEQemuConfigRole }): Promise<resp<PVEResp | undefined>> {
        return await pveRequestAdapterService.getQemuConfig({
            role: input.role,
            user: input.user,
            query: input.query ?? {}
        }) as resp<PVEResp | undefined>;
    }

    public async getNodes(): Promise<resp<PVEResp | undefined>> {
        return await pveRequestAdapterService.getNodes() as resp<PVEResp | undefined>;
    }

    public getMultipleTasksStatus(input: PVEServiceAdapterInput): Promise<resp<any>> {
        return pveRequestAdapterService.getMultipleTasksStatus({
            user: input.user,
            body: input.body ?? {}
        });
    }

    public getUserLatestTaskStatus(input: PVEServiceAdapterInput): Promise<resp<any>> {
        return pveRequestAdapterService.getUserLatestTaskStatus(input);
    }

    public getUserAllTasksStatus(input: PVEServiceAdapterInput): Promise<resp<any>> {
        return pveRequestAdapterService.getUserAllTasksStatus({
            user: input.user,
            query: input.query ?? {}
        });
    }

    public refreshTaskStatus(input: PVEServiceAdapterInput): Promise<resp<any>> {
        return pveRequestAdapterService.refreshTaskStatus({
            user: input.user,
            body: input.body ?? {}
        });
    }

    public cleanupTasks(): Promise<resp<any>> {
        return pveRequestAdapterService.cleanupTasks();
    }

    public getDatacenterStatus(): Promise<resp<any>> {
        return pveRequestAdapterService.getDatacenterStatus();
    }
}
