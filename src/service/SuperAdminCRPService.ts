import { Request } from "express";
import { Service } from "../abstract/Service";
import { ComputeResourcePlan } from "../interfaces/ComputeResourcePlan";
import { User } from "../interfaces/User";
import { logger } from "../middlewares/log";
import { computeResourcePlanRequestAdapterService } from "../modules/crp/ComputeResourcePlanRequestAdapterService";
import { validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { createResponse, resp } from "../utils/resp";

type TokenValidator = (request: Request) => Promise<{ user: User; error?: resp<any> }>;
type SuperAdminCRPServiceInput = {
    user: User;
    body: Request["body"];
    params: Request["params"];
};

export class SuperAdminCRPService extends Service {
    public async createCRP(request: Request): Promise<resp<ComputeResourcePlan | undefined>> {
        return this.withSuperAdminInput(request, "createCRP", "Error creating CRP", (input) =>
            computeResourcePlanRequestAdapterService.createCRP(input)
        );
    }

    public async updateCRP(request: Request): Promise<resp<ComputeResourcePlan | undefined>> {
        return this.withSuperAdminInput(request, "updateCRP", "Error updating CRP", (input) =>
            computeResourcePlanRequestAdapterService.updateCRP(input)
        );
    }

    public async deleteCRP(request: Request): Promise<resp<undefined>> {
        return this.withSuperAdminInput(request, "deleteCRP", "Error deleting CRP", (input) =>
            computeResourcePlanRequestAdapterService.deleteCRP(input)
        );
    }

    public async getAllCRPs(request: Request): Promise<resp<ComputeResourcePlan[] | undefined>> {
        return this.withValidatedUser(request, "getAllCRPs", validateTokenAndGetUser, () =>
            computeResourcePlanRequestAdapterService.getAllCRPs(), "Error in getAllCRPs"
        );
    }

    public async getCRPById(request: Request): Promise<resp<ComputeResourcePlan | undefined>> {
        return this.withSuperAdminInput(request, "getCRPById", "Error retrieving CRP", (input) =>
            computeResourcePlanRequestAdapterService.getCRPById(input)
        );
    }

    private withSuperAdminInput<T>(
        request: Request,
        operation: string,
        errorLogPrefix: string,
        action: (input: SuperAdminCRPServiceInput) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        return this.withValidatedUser(request, operation, validateTokenAndGetSuperAdminUser, (user) =>
            action(this.toServiceInput(request, user)), errorLogPrefix
        );
    }

    private async withValidatedUser<T>(
        request: Request,
        operation: string,
        validator: TokenValidator,
        action: (user: User) => Promise<resp<T | undefined>>,
        errorLogPrefix: string
    ): Promise<resp<T | undefined>> {
        try {
            const { user, error } = await validator(request);
            if (error) {
                logger.warn(`Token validation failed in ${operation}: ${error.message}`);
                return createResponse(error.code, error.message);
            }

            return action(user);
        } catch (error: any) {
            logger.error(`${errorLogPrefix}: ${error.message}`);
            return createResponse(500, `Internal Server Error: ${error.message}`);
        }
    }

    private toServiceInput(request: Request, user: User): SuperAdminCRPServiceInput {
        return {
            user,
            body: request.body,
            params: request.params
        };
    }
}
