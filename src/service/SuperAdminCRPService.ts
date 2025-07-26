import { Request } from "express";
import { Service } from "../abstract/Service";
import { logger } from "../middlewares/log";
import { createResponse, resp } from "../utils/resp";
import { validateTokenAndGetUser } from "../utils/auth";
import { ComputeResourcePlanModel } from '../orm/schemas/ComputeResourcePlanSchemas';
import { ComputeResourcePlan } from '../interfaces/ComputeResourcePlan';
import { User } from '../interfaces/User';


export class SuperAdminCRPService extends Service {

    /**
     * 
     * 
     * 
     */

    public async createCRP(request: Request): Promise<resp<ComputeResourcePlan | undefined>> {

        try {
            // 驗證
            const { user, error } = await validateTokenAndGetUser<User>(request);
            if (error) {
                return createResponse(401, "Unauthorized: Invalid token");
            }
            if (user.role !== 'superadmin') {
                return createResponse(403, "Forbidden: requires superadmin role");
            }

            const planData: ComputeResourcePlan = request.body;
            if (!planData.name) {
                return createResponse(400, "Bad Request: Missing required field 'name'")
            }

            // 檢查名稱是否已存在
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
    * 
    * 
    * 
    **/

    public async updateCRP(request: Request): Promise<resp<ComputeResourcePlan | undefined>> {

        try {
            // 驗證
            const { user, error } = await validateTokenAndGetUser<User>(request);
            if (error) {
                return createResponse(401, "Unauthorized: Invalid token");
            }
            if (user.role !== 'superadmin') {
                return createResponse(403, "Forbidden: requires superadmin role");
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
    * 
    * 
    * 
    **/

    public async deleteCRP(request: Request): Promise<resp<undefined>> {

        try {

            // 驗證
            const { user, error } = await validateTokenAndGetUser<User>(request);
            if (error) {
                return createResponse(401, "Unauthorized: Invalid token");
            }
            if (user.role !== 'superadmin') {
                return createResponse(403, "Forbidden: requires superadmin role");
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
    * 
    * 
    * 
    **/

    public async getAllCRPs(request: Request): Promise<resp<ComputeResourcePlan[] | undefined>> {
        try {
            // 驗證
            const { user, error } = await validateTokenAndGetUser<User>(request);
            if (error) {
                return createResponse(401, "Unauthorized: Invalid token");
            }
            if (user.role !== 'superadmin') {
                return createResponse(403, "Forbidden: requires superadmin role");
            }

            const CRPs = await ComputeResourcePlanModel.find();
            return createResponse(200, "CRPs retrieved successfully", CRPs);
        } catch (e: any) {
            logger.error(`Error retrieving CRPs: ${e.message}`);
            return createResponse(500, "Internal Server Error: " + e.message);
        }
    }
}