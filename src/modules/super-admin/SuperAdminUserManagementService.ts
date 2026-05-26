import Roles from "../../enum/role";
import { ComputeResourcePlan } from "../../interfaces/ComputeResourcePlan";
import { User } from "../../interfaces/User";
import { logger } from "../../middlewares/log";
import { ComputeResourcePlanModel } from "../../orm/schemas/ComputeResourcePlanSchemas";
import { UsersModel } from "../../orm/schemas/UserSchemas";
import { createResponse, resp } from "../../utils/resp";
import { validateObjectIdInput } from "../common/ObjectIdPolicy";
import { validateAssignableUserRole } from "./SuperAdminUserMutationPolicy";

type PersistableUser = User & {
    save(): Promise<unknown>;
    populate?(path: string): Promise<unknown>;
};

type SuperAdminUserRepository = {
    findUserById(userId: string): Promise<PersistableUser | null>;
    findPlanById(planId: string): Promise<(ComputeResourcePlan & { _id?: any }) | null>;
    listUsersByRole(role: Roles): Promise<User[]>;
};

type SuperAdminUserManagementServiceDeps = {
    repo?: SuperAdminUserRepository;
};

const superAdminUserRepository: SuperAdminUserRepository = {
    async findUserById(userId: string): Promise<PersistableUser | null> {
        return UsersModel.findById(userId) as any;
    },
    async findPlanById(planId: string): Promise<(ComputeResourcePlan & { _id?: any }) | null> {
        return ComputeResourcePlanModel.findById(planId) as any;
    },
    async listUsersByRole(role: Roles): Promise<User[]> {
        return UsersModel.find({ role }).lean() as any;
    }
};

export class SuperAdminUserManagementService {
    private readonly repo: SuperAdminUserRepository;

    constructor(deps: SuperAdminUserManagementServiceDeps = {}) {
        this.repo = deps.repo ?? superAdminUserRepository;
    }

    public async changeUserRole(input: {
        actor: User;
        userId: unknown;
        newRole: unknown;
    }): Promise<resp<undefined>> {
        try {
            const userIdResult = validateObjectIdInput(input.userId, "userId");
            if (!userIdResult.valid) {
                return createResponse(400, userIdResult.message);
            }

            const roleResult = validateAssignableUserRole(input.newRole);
            if (!roleResult.valid) {
                return createResponse(400, roleResult.message);
            }

            const targetUser = await this.repo.findUserById(userIdResult.value);
            if (!targetUser) {
                return createResponse(404, "Target user not found");
            }
            if (targetUser.role === Roles.SuperAdmin) {
                return createResponse(403, "Cannot change role of a superadmin");
            }

            targetUser.role = roleResult.role;
            await targetUser.save();

            logger.info(`SuperAdmin ${input.actor.username} changed user ${targetUser.username}'s role to ${roleResult.role}`);
            return createResponse(200, "User role updated successfully");
        } catch (error: any) {
            logger.error(`Error changing user role: ${error.message}`);
            return createResponse(500, "Internal Server Error: " + error.message);
        }
    }

    public async assignCRPToUser(input: {
        actor: User;
        userId: unknown;
        planId: unknown;
    }): Promise<resp<any | undefined>> {
        try {
            const userIdResult = validateObjectIdInput(input.userId, "userId");
            if (!userIdResult.valid) {
                return createResponse(400, userIdResult.message);
            }
            const planIdResult = validateObjectIdInput(input.planId, "planId");
            if (!planIdResult.valid) {
                return createResponse(400, planIdResult.message);
            }

            const [targetUser, plan] = await Promise.all([
                this.repo.findUserById(userIdResult.value),
                this.repo.findPlanById(planIdResult.value)
            ]);

            if (!targetUser) {
                return createResponse(404, "Target user not found");
            }
            if (!plan) {
                return createResponse(404, "Compute Resource Plan not found");
            }

            targetUser.compute_resource_plan_id = String(plan._id ?? planIdResult.value);
            await targetUser.save();
            if (typeof targetUser.populate === "function") {
                await targetUser.populate("compute_resource_plan_id");
            }

            logger.info(`SuperAdmin ${input.actor.username} assigned CRP ${plan.name} to user ${targetUser.username}`);
            return createResponse(200, "CRP assigned to user successfully", {
                user: targetUser.username,
                role: targetUser.role,
                planId: targetUser.compute_resource_plan_id
            });
        } catch (error: any) {
            logger.error(`Error assigning CRP to user: ${error.message}`);
            return createResponse(500, "Internal Server Error: " + error.message);
        }
    }

    public async listRegularUsers(actor: User): Promise<resp<User[] | undefined>> {
        return this.listUsersByRole(actor, Roles.User, "No users found", "All users retrieved successfully");
    }

    public async listAdminUsers(actor: User): Promise<resp<User[] | undefined>> {
        return this.listUsersByRole(actor, Roles.Admin, "No admin users found", "All admin users retrieved successfully");
    }

    private async listUsersByRole(
        actor: User,
        role: Roles,
        emptyMessage: string,
        successMessage: string
    ): Promise<resp<User[] | undefined>> {
        try {
            if (!actor.isVerified) {
                return createResponse(403, "user is not verified");
            }

            const users = await this.repo.listUsersByRole(role);
            if (!users || users.length === 0) {
                return createResponse(404, emptyMessage);
            }

            return createResponse(200, successMessage, users);
        } catch (error) {
            logger.error(`Error listing ${role} users: ${error}`);
            return createResponse(500, "Internal server error");
        }
    }
}

export const superAdminUserManagementService = new SuperAdminUserManagementService();
