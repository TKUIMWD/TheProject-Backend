import { ComputeResourcePlan } from "../../interfaces/ComputeResourcePlan";
import { User } from "../../interfaces/User";
import { logger } from "../../middlewares/log";
import { ComputeResourcePlanModel } from "../../orm/schemas/ComputeResourcePlanSchemas";
import { createResponse, resp } from "../../utils/resp";
import { validateObjectIdInput } from "../common/ObjectIdPolicy";
import { validateComputeResourcePlanInput } from "./ComputeResourcePlanPolicy";

type ComputeResourcePlanRepository = {
    findByName(name: string): Promise<ComputeResourcePlan | null>;
    create(plan: ComputeResourcePlan): Promise<ComputeResourcePlan>;
    updateById(planId: string, update: Partial<ComputeResourcePlan>): Promise<ComputeResourcePlan | null>;
    deleteById(planId: string): Promise<ComputeResourcePlan | null>;
    listAll(): Promise<ComputeResourcePlan[]>;
    findById(planId: string): Promise<ComputeResourcePlan | null>;
};

type ComputeResourcePlanManagementServiceDeps = {
    planRepo?: ComputeResourcePlanRepository;
};

const computeResourcePlanRepository: ComputeResourcePlanRepository = {
    async findByName(name: string): Promise<ComputeResourcePlan | null> {
        return ComputeResourcePlanModel.findOne({ name });
    },
    async create(plan: ComputeResourcePlan): Promise<ComputeResourcePlan> {
        return ComputeResourcePlanModel.create(plan);
    },
    async updateById(planId: string, update: Partial<ComputeResourcePlan>): Promise<ComputeResourcePlan | null> {
        return ComputeResourcePlanModel.findByIdAndUpdate(planId, update, { new: true });
    },
    async deleteById(planId: string): Promise<ComputeResourcePlan | null> {
        return ComputeResourcePlanModel.findByIdAndDelete(planId);
    },
    async listAll(): Promise<ComputeResourcePlan[]> {
        return ComputeResourcePlanModel.find();
    },
    async findById(planId: string): Promise<ComputeResourcePlan | null> {
        return ComputeResourcePlanModel.findById(planId);
    }
};

export class ComputeResourcePlanManagementService {
    private readonly planRepo: ComputeResourcePlanRepository;

    constructor(deps: ComputeResourcePlanManagementServiceDeps = {}) {
        this.planRepo = deps.planRepo ?? computeResourcePlanRepository;
    }

    public async createPlan(input: {
        user: User;
        body: unknown;
    }): Promise<resp<ComputeResourcePlan | undefined>> {
        try {
            const planValidation = validateComputeResourcePlanInput(input.body);
            if (!planValidation.valid) {
                return createResponse(400, `Bad Request: ${planValidation.message}`);
            }
            const planData = planValidation.value as ComputeResourcePlan;

            const existingPlan = await this.planRepo.findByName(planData.name);
            if (existingPlan) {
                return createResponse(409, `Conflict: CRP with name "${planData.name}" already exists`);
            }

            const newPlan = await this.planRepo.create(planData);
            logger.info(`SuperAdmin ${input.user.username} created a new CRP: ${newPlan.name}`);
            return createResponse(201, "CRP created successfully", newPlan);
        } catch (error: any) {
            logger.error(`Error creating CRP: ${error.message}`);
            return createResponse(500, "Internal Server Error: " + error.message);
        }
    }

    public async updatePlan(input: {
        user: User;
        planId: unknown;
        body: unknown;
    }): Promise<resp<ComputeResourcePlan | undefined>> {
        try {
            const crpIdResult = validateObjectIdInput(input.planId, "crpId");
            if (!crpIdResult.valid) {
                return createResponse(400, crpIdResult.message);
            }

            const planValidation = validateComputeResourcePlanInput(input.body, { partial: true });
            if (!planValidation.valid) {
                return createResponse(400, `Bad Request: ${planValidation.message}`);
            }

            const updatedPlan = await this.planRepo.updateById(crpIdResult.value, planValidation.value);
            if (!updatedPlan) {
                return createResponse(404, "Not Found: CRP not found");
            }

            logger.info(`SuperAdmin ${input.user.username} updated CRP: ${updatedPlan.name}`);
            return createResponse(200, "CRP updated successfully", updatedPlan);
        } catch (error: any) {
            logger.error(`Error updating CRP: ${error.message}`);
            return createResponse(500, "Internal Server Error: " + error.message);
        }
    }

    public async deletePlan(input: {
        user: User;
        planId: unknown;
    }): Promise<resp<undefined>> {
        try {
            const crpIdResult = validateObjectIdInput(input.planId, "crpId");
            if (!crpIdResult.valid) {
                return createResponse(400, crpIdResult.message);
            }

            const deletedPlan = await this.planRepo.deleteById(crpIdResult.value);
            if (!deletedPlan) {
                return createResponse(404, "Not Found: CRP not found");
            }

            logger.info(`SuperAdmin ${input.user.username} deleted CRP: ${deletedPlan.name} (ID: ${crpIdResult.value})`);
            return createResponse(200, "CRP deleted successfully");
        } catch (error: any) {
            logger.error(`Error deleting CRP: ${error.message}`);
            return createResponse(500, "Internal Server Error: " + error.message);
        }
    }

    public async listPlans(): Promise<resp<ComputeResourcePlan[] | undefined>> {
        try {
            const plans = await this.planRepo.listAll();
            return createResponse(200, "CRPs retrieved successfully", plans);
        } catch (error) {
            logger.error("Error in ComputeResourcePlanManagementService.listPlans:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async getPlanById(planId: unknown): Promise<resp<ComputeResourcePlan | undefined>> {
        try {
            const crpIdResult = validateObjectIdInput(planId, "crpId");
            if (!crpIdResult.valid) {
                return createResponse(400, crpIdResult.message);
            }

            const plan = await this.planRepo.findById(crpIdResult.value);
            if (!plan) {
                return createResponse(404, "Not Found: CRP not found");
            }

            return createResponse(200, "CRP retrieved successfully", plan);
        } catch (error: any) {
            logger.error(`Error retrieving CRP: ${error.message}`);
            return createResponse(500, "Internal Server Error: " + error.message);
        }
    }
}

export const computeResourcePlanManagementService = new ComputeResourcePlanManagementService();
