import { Request } from "express";
import { Service } from "../abstract/Service";
import { logger } from "../middlewares/log";
import { createResponse, resp } from "../utils/resp";
import { validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { ComputeResourcePlanModel } from '../orm/schemas/ComputeResourcePlanSchemas';
import { ComputeResourcePlan } from '../interfaces/ComputeResourcePlan';
import { User } from '../interfaces/User';


/**
 * Service for SuperAdmins to manage Compute Resource Plans (CRPs).
 */


export class SuperAdminCRPService extends Service {

    /**
     * Creates a new Compute Resource Plan.
     * Requires SuperAdmin role.
     * @param request - The Express request object, containing plan data in the body.
     * @returns A response object containing the newly created plan.
     */

    public async createCRP(request: Request): Promise<resp<ComputeResourcePlan | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<User>(request);
            if (error) {
                console.error("Error validating token:", error);
                return createResponse(error.code, error.message);
            }

            const planData: ComputeResourcePlan = request.body;
            if (!planData.name) {
                return createResponse(400, "Bad Request: Missing required field 'name'")
            }


            const existingPlan = await ComputeResourcePlanModel.findOne({ name: planData.name });
            if (existingPlan) {
                return createResponse(409, `Conflict: CRP with name "${planData.name}" already exists`);
            }


            const newPlan = await ComputeResourcePlanModel.create(planData);
            logger.info(`SuperAdmin ${user.username} created a new CRP: ${newPlan.name}`);
            return createResponse(201, "CRP created successfully", newPlan);

        } catch (e: any) {
            logger.error(`Error creating CRP: ${e.message}`);
            return createResponse(500, "Internal Server Error: " + e.message);
        }
    }


    /**
     * Updates an existing Compute Resource Plan.
     * Requires SuperAdmin role.
     * @param request - The Express request object, containing crpId in params and update data in the body.
     * @returns A response object containing the updated plan.
     */

    public async updateCRP(request: Request): Promise<resp<ComputeResourcePlan | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<User>(request);
            if (error) {
                console.error("Error validating token:", error);
                return createResponse(error.code, error.message);
            }

            const { crpId } = request.params;

            const updateData: Partial<ComputeResourcePlan> = request.body;

            const updateCRP = await ComputeResourcePlanModel.findByIdAndUpdate(crpId, updateData, { new: true });
            if (!updateCRP) {
                return createResponse(404, "Not Found: CRP not found");
            }

            logger.info(`SuperAdmin ${user.username} updated CRP: ${updateCRP.name}`);
            return createResponse(200, "CRP updated successfully", updateCRP);

        } catch (e: any) {
            logger.error(`Error updating CRP: ${e.message}`);
            return createResponse(500, "Internal Server Error: " + e.message);
        }
    }

    /**
     * Deletes a Compute Resource Plan.
     * Requires SuperAdmin role.
     * @param request - The Express request object, containing crpId in params.
     * @returns A response object indicating the result of the operation.
     */

    public async deleteCRP(request: Request): Promise<resp<undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<User>(request);
            if (error) {
                console.error("Error validating token:", error);
                return createResponse(error.code, error.message);
            }

            const { crpId } = request.params;

            const deletedCRP = await ComputeResourcePlanModel.findByIdAndDelete(crpId);

            if (!deletedCRP) {
                return createResponse(404, "Not Found: CRP not found");
            }

            logger.info(`SuperAdmin ${user.username} deleted CRP: ${deletedCRP.name} (ID: ${crpId})`);
            return createResponse(200, "CRP deleted successfully");

        } catch (e: any) {
            logger.error(`Error deleting CRP: ${e.message}`);
            return createResponse(500, "Internal Server Error: " + e.message);
        }
    }

    /**
     * Retrieves a list of all Compute Resource Plans.
     * Requires Admin or SuperAdmin role.
     * @param request - The Express request object.
     * @returns A response object containing an array of all CRPs.
     */

    public async getAllCRPs(request: Request): Promise<resp<ComputeResourcePlan[] | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(request);
            if (error) {
                console.error("Error validating token:", error);
                return createResponse(error.code, error.message);
            }

            const CRPs = await ComputeResourcePlanModel.find();
            return createResponse(200, "CRPs retrieved successfully", CRPs);
        } catch (error) {
            console.error("Error in getAllCRPs:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async getCRPById(request: Request): Promise<resp<ComputeResourcePlan | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<User>(request);
            if (error) {
                console.error("Error validating token:", error);
                return createResponse(error.code, error.message);
            }

            const { crpId } = request.params;

            const crp = await ComputeResourcePlanModel.findById(crpId);
            if (!crp) {
                return createResponse(404, "Not Found: CRP not found");
            }

            return createResponse(200, "CRP retrieved successfully", crp);
        } catch (e: any) {
            logger.error(`Error retrieving CRP: ${e.message}`);
            return createResponse(500, "Internal Server Error: " + e.message);
        }
    }
}