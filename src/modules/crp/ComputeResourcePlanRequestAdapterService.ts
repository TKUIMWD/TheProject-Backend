import { ComputeResourcePlan } from "../../interfaces/ComputeResourcePlan";
import { User } from "../../interfaces/User";
import { resp } from "../../utils/resp";
import { computeResourcePlanManagementService } from "./ComputeResourcePlanManagementService";

type ComputeResourcePlanRequestAdapterServiceDeps = {
    management?: {
        createPlan(input: {
            user: User;
            body: unknown;
        }): Promise<resp<ComputeResourcePlan | undefined>>;
        updatePlan(input: {
            user: User;
            planId: unknown;
            body: unknown;
        }): Promise<resp<ComputeResourcePlan | undefined>>;
        deletePlan(input: {
            user: User;
            planId: unknown;
        }): Promise<resp<undefined>>;
        listPlans(): Promise<resp<ComputeResourcePlan[] | undefined>>;
        getPlanById(planId: unknown): Promise<resp<ComputeResourcePlan | undefined>>;
    };
};

export class ComputeResourcePlanRequestAdapterService {
    private readonly management: NonNullable<ComputeResourcePlanRequestAdapterServiceDeps["management"]>;

    constructor(deps: ComputeResourcePlanRequestAdapterServiceDeps = {}) {
        this.management = deps.management ?? computeResourcePlanManagementService;
    }

    public async createCRP(input: {
        user: User;
        body: unknown;
    }): Promise<resp<ComputeResourcePlan | undefined>> {
        return this.management.createPlan(input);
    }

    public async updateCRP(input: {
        user: User;
        params: { crpId?: unknown };
        body: unknown;
    }): Promise<resp<ComputeResourcePlan | undefined>> {
        return this.management.updatePlan({
            user: input.user,
            planId: input.params.crpId,
            body: input.body
        });
    }

    public async deleteCRP(input: {
        user: User;
        params: { crpId?: unknown };
    }): Promise<resp<undefined>> {
        return this.management.deletePlan({
            user: input.user,
            planId: input.params.crpId
        });
    }

    public async getAllCRPs(): Promise<resp<ComputeResourcePlan[] | undefined>> {
        return this.management.listPlans();
    }

    public async getCRPById(input: {
        params: { crpId?: unknown };
    }): Promise<resp<ComputeResourcePlan | undefined>> {
        return this.management.getPlanById(input.params.crpId);
    }
}

export const computeResourcePlanRequestAdapterService = new ComputeResourcePlanRequestAdapterService();
