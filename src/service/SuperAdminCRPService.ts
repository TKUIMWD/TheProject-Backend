import { Service } from "../abstract/Service";
import { ComputeResourcePlan } from "../interfaces/ComputeResourcePlan";
import { User } from "../interfaces/User";
import { computeResourcePlanRequestAdapterService } from "../modules/crp/ComputeResourcePlanRequestAdapterService";
import { resp } from "../utils/resp";

export type SuperAdminCRPServiceInput = {
    user: User;
    body?: unknown;
    params?: Record<string, unknown>;
};

export class SuperAdminCRPService extends Service {
    public createCRP(input: SuperAdminCRPServiceInput): Promise<resp<ComputeResourcePlan | undefined>> {
        return computeResourcePlanRequestAdapterService.createCRP({
            user: input.user,
            body: input.body
        });
    }

    public updateCRP(input: SuperAdminCRPServiceInput): Promise<resp<ComputeResourcePlan | undefined>> {
        return computeResourcePlanRequestAdapterService.updateCRP({
            user: input.user,
            body: input.body,
            params: input.params ?? {}
        });
    }

    public deleteCRP(input: SuperAdminCRPServiceInput): Promise<resp<undefined>> {
        return computeResourcePlanRequestAdapterService.deleteCRP({
            user: input.user,
            params: input.params ?? {}
        });
    }

    public getAllCRPs(): Promise<resp<ComputeResourcePlan[] | undefined>> {
        return computeResourcePlanRequestAdapterService.getAllCRPs();
    }

    public getCRPById(input: Pick<SuperAdminCRPServiceInput, "params">): Promise<resp<ComputeResourcePlan | undefined>> {
        return computeResourcePlanRequestAdapterService.getCRPById({
            params: input.params ?? {}
        });
    }
}
