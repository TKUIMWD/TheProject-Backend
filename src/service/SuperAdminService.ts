import { Request } from "express";
import { Service } from "../abstract/Service";
import { logger } from "../middlewares/log";
import { createResponse, resp } from "../utils/resp";
import { validateTokenAndGetSuperAdminUser } from "../utils/auth";
import { UsersModel } from '../orm/schemas/UserSchemas';
import { User } from '../interfaces/User';
import { ComputeResourcePlanModel } from "../orm/schemas/ComputeResourcePlanSchemas";
import { validateObjectIdInput } from "../modules/common/ObjectIdPolicy";
import { validateAssignableUserRole } from "../modules/super-admin/SuperAdminUserMutationPolicy";

/**
 * Service for SuperAdmins to manage user-related administrative tasks.
 */

export class SuperAdminService extends Service {

    /**
     * Changes the role of a specified user.
     * Can only change roles to 'user' or 'admin'.
     * @param request - The Express request object, containing userId and newRole in the body.
     * @returns A response object indicating the result of the operation.
     */

    public async changeUserRole(request: Request): Promise<resp<undefined>> {

        try {

            const { user: adminuser, error } = await validateTokenAndGetSuperAdminUser<User>(request);
            if (error) {
                return createResponse(error.code, error.message);
            }

            const { userId, newRole } = request.body;

            const userIdResult = validateObjectIdInput(userId, "userId");
            if (!userIdResult.valid) {
                return createResponse(400, userIdResult.message);
            }
            const normalizedUserId = userIdResult.value;

            const roleResult = validateAssignableUserRole(newRole);
            if (!roleResult.valid) {
                return createResponse(400, roleResult.message);
            }

            const targetUser = await UsersModel.findById(normalizedUserId);
            if (!targetUser) {
                return createResponse(404, "Target user not found");
            }
            if (targetUser.role === 'superadmin') {
                return createResponse(403, "Cannot change role of a superadmin");
            }

            targetUser.role = roleResult.role;
            await targetUser.save();

            logger.info(`SuperAdmin ${adminuser.username} changed user ${targetUser.username}'s role to ${roleResult.role}`);
            return createResponse(200, "User role updated successfully");

        } catch (e: any) {
            logger.error(`Error changing user role: ${e.message}`);
            return createResponse(500, "Internal Server Error: " + e.message);
        }
    }

    /**
     * Assigns a Compute Resource Plan to a specified user.
     * @param request - The Express request object, containing userId and CRPId in the body.
     * @returns A response object with the updated user and plan info.
     */

    public async assignCRPToUser(request: Request): Promise<resp<any | undefined>> {

        try {

            const { user: adminuser, error } = await validateTokenAndGetSuperAdminUser<User>(request);
            if (error) {
                return error;
            }

            const { userId, planId } = request.body;

            const userIdResult = validateObjectIdInput(userId, "userId");
            if (!userIdResult.valid) {
                return createResponse(400, userIdResult.message);
            }
            const planIdResult = validateObjectIdInput(planId, "planId");
            if (!planIdResult.valid) {
                return createResponse(400, planIdResult.message);
            }

            const [targetUser, CRP] = await Promise.all([
                UsersModel.findById(userIdResult.value),
                ComputeResourcePlanModel.findById(planIdResult.value)
            ]);

            if (!targetUser) {
                return createResponse(404, "Target user not found");
            }
            if (!CRP) {
                return createResponse(404, "Compute Resource Plan not found");
            }

            targetUser.compute_resource_plan_id = CRP._id;
            await targetUser.save();
            await targetUser.populate('compute_resource_plan_id');

            logger.info(`SuperAdmin ${adminuser.username} assigned CRP ${CRP.name} to user ${targetUser.username}`);

            const responseData = {
                user: targetUser.username,
                role: targetUser.role,
                planId: targetUser.compute_resource_plan_id
            };
            return createResponse(200, "CRP assigned to user successfully", responseData);

        } catch (e: any) {
            logger.error(`Error assigning CRP to user: ${e.message}`);
            return createResponse(500, "Internal Server Error: " + e.message);
        }
    }

    // get all users (superadmin only)
    public async getAllUsers(Request: Request): Promise<resp<Array<User> | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<User[]>(Request);
            if (error) {
                return error;
            }

            if (!user.isVerified) {
                return createResponse(403, "user is not verified");
            }

            const users = await UsersModel.find({ role: 'user' }).lean();
            if (!users || users.length === 0) {
                return createResponse(404, "No users found");
            }
            return createResponse(200, "All users retrieved successfully", users);
        } catch (error) {
            logger.error(`Error getting all users: ${error}`);
            return createResponse(500, "Internal server error");
        }
    }

    // get all admin users
    public async getAllAdminUsers(Request: Request): Promise<resp<Array<User> | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<User[]>(Request);
            if (error) {
                return error;
            }

            if (!user.isVerified) {
                return createResponse(403, "user is not verified");
            }

            const adminUsers = await UsersModel.find({ role: 'admin' }).lean();
            if (!adminUsers || adminUsers.length === 0) {
                return createResponse(404, "No admin users found");
            }
            return createResponse(200, "All admin users retrieved successfully", adminUsers);
        } catch (error) {
            logger.error(`Error getting all admin users: ${error}`);
            return createResponse(500, "Internal server error");
        }
    }
}
