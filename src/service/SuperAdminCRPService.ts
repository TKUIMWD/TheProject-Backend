import { Request } from "express";
import { Service } from "../abstract/Service";
import { logger } from "../middlewares/log";
import { createResponse, resp } from "../utils/resp";
import { validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { ComputeResourcePlan } from '../interfaces/ComputeResourcePlan';
import { User } from '../interfaces/User';
import { computeResourcePlanManagementService } from "../modules/crp/ComputeResourcePlanManagementService";

/**
 * Service for SuperAdmins to manage Compute Resource Plans (CRPs).
 */
export class SuperAdminCRPService extends Service {
    public async createCRP(request: Request): Promise<resp<ComputeResourcePlan | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<User>(request);
            if (error) {
                logger.warn(`Token validation failed in createCRP: ${error.message}`);
                return createResponse(error.code, error.message);
            }

            return computeResourcePlanManagementService.createPlan({
                user,
                body: request.body
            });
        } catch (error: any) {
            logger.error(`Error creating CRP: ${error.message}`);
            return createResponse(500, "Internal Server Error: " + error.message);
        }
    }

    public async updateCRP(request: Request): Promise<resp<ComputeResourcePlan | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<User>(request);
            if (error) {
                logger.warn(`Token validation failed in updateCRP: ${error.message}`);
                return createResponse(error.code, error.message);
            }

            return computeResourcePlanManagementService.updatePlan({
                user,
                planId: request.params.crpId,
                body: request.body
            });
        } catch (error: any) {
            logger.error(`Error updating CRP: ${error.message}`);
            return createResponse(500, "Internal Server Error: " + error.message);
        }
    }

    public async deleteCRP(request: Request): Promise<resp<undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<User>(request);
            if (error) {
                logger.warn(`Token validation failed in deleteCRP: ${error.message}`);
                return createResponse(error.code, error.message);
            }

            return computeResourcePlanManagementService.deletePlan({
                user,
                planId: request.params.crpId
            });
        } catch (error: any) {
            logger.error(`Error deleting CRP: ${error.message}`);
            return createResponse(500, "Internal Server Error: " + error.message);
        }
    }

    public async getAllCRPs(request: Request): Promise<resp<ComputeResourcePlan[] | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(request);
            if (error) {
                logger.warn(`Token validation failed in getAllCRPs: ${error.message}`);
                return createResponse(error.code, error.message);
            }

            return computeResourcePlanManagementService.listPlans();
        } catch (error) {
            logger.error("Error in getAllCRPs:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async getCRPById(request: Request): Promise<resp<ComputeResourcePlan | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<User>(request);
            if (error) {
                logger.warn(`Token validation failed in getCRPById: ${error.message}`);
                return createResponse(error.code, error.message);
            }

            return computeResourcePlanManagementService.getPlanById(request.params.crpId);
        } catch (error: any) {
            logger.error(`Error retrieving CRP: ${error.message}`);
            return createResponse(500, "Internal Server Error: " + error.message);
        }
    }
}
