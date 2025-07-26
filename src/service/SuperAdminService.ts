import { Request } from "express";
import { Service } from "../abstract/Service";
import { logger } from "../middlewares/log";
import { createResponse, resp } from "../utils/resp";
import { validateTokenAndGetUser } from "../utils/auth";
import { UsersModel } from '../orm/schemas/UserSchemas';
import { User } from '../interfaces/User';
import { ComputeResourcePlanModel } from "../orm/schemas/ComputeResourcePlanSchemas";

export class SuperAdminService extends Service {

    /**
    * 
    * 
    * 
    **/

    public async changeUserRole(request: Request): Promise<resp<undefined>> {

        try{

            const { user: adminuser, error } = await validateTokenAndGetUser<User>(request);
            if( error ){
                return createResponse(401, "Unauthorized: Invalid token");
            }
            if( adminuser.role !== 'superadmin' ){
                return createResponse(403, "Forbidden: requires superadmin role");
            }

            const { userId, newRole } = request.body;

            if(!userId){
                return createResponse(400, "Missing 'userId' field");
            }

            if(!newRole || !['user' , "admin"].includes(newRole)){
                return createResponse(400, "Invalid or missing 'newRole' field. Can only be 'user' or 'admin'.");
            };

            const targetUser = await UsersModel.findById(userId);
            if(!targetUser){
                return createResponse(404, "Target user not found");
            }
            if(targetUser.role === 'superadmin'){
                return createResponse(403, "Cannot change role of a superadmin");
            }

            targetUser.role = newRole;
            await targetUser.save();

            logger.info(`SuperAdmin ${adminuser.username} changed user ${targetUser.username}'s role to ${newRole}`);
            return createResponse(200, "User role updated successfully");

        }catch(e: any){
            logger.error(`Error changing user role: ${e.message}`);
            return createResponse(500, "Internal Server Error: " + e.message);
        }
    }

    /**
    * 
    * 
    * 
    **/

    public async assignCRPToUser(request: Request): Promise<resp<any | undefined>> {

        try{

            const { user: adminuser, error } = await validateTokenAndGetUser<User>(request);
            if( error ){
                return createResponse(401, "Unauthorized: Invalid token");
            }
            if( adminuser.role !== 'superadmin' ){
                return createResponse(403, "Forbidden: requires superadmin role");
            }

            const { userId, CRPId } = request.body;

            if(!userId){
                return createResponse(400, "Missing 'userId' field");
            }
            if(!CRPId){
                return createResponse(400, "Missing 'CRPId' field");
            }

            const [targetUser, CRP ] = await Promise.all([
                UsersModel.findById(userId),
                ComputeResourcePlanModel.findById(CRPId)
            ]);

            if(!targetUser){
                return createResponse(404, "Target user not found");
            }
            if(!CRP){
                return createResponse(404, "Compute Resource Plan not found");
            }

            targetUser.compute_resource_plan_id = CRP._id;
            await targetUser.save();
            await targetUser.populate('compute_resource_plan_id');

            logger.info(`SuperAdmin ${adminuser.username} assigned CRP ${CRP.name} to user ${targetUser.username}`);

            const responseData = {
                user: targetUser.username,
                role: targetUser.role,
                CRP: targetUser.compute_resource_plan_id
            };
            return createResponse(200, "CRP assigned to user successfully", responseData);

        }catch(e: any){
            logger.error(`Error assigning CRP to user: ${e.message}`);
            return createResponse(500, "Internal Server Error: " + e.message);
        }
    }
}
