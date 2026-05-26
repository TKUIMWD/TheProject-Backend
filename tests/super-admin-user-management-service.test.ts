import { describe, expect, it } from "vitest";
import Roles from "../src/enum/role";
import { SuperAdminUserManagementService } from "../src/modules/super-admin/SuperAdminUserManagementService";

const actorId = "507f1f77bcf86cd79943a101";
const userId = "507f1f77bcf86cd79943a102";
const planId = "507f1f77bcf86cd79943a103";

function makeActor(overrides: Record<string, unknown> = {}) {
    return {
        _id: actorId,
        username: "root-admin",
        email: "root@example.test",
        role: Roles.SuperAdmin,
        password_hash: "",
        isVerified: true,
        compute_resource_plan_id: "",
        used_compute_resource_id: "",
        course_ids: [],
        owned_vms: [],
        owned_templates: [],
        ...overrides
    } as any;
}

function makeUser(overrides: Record<string, unknown> = {}) {
    return {
        _id: userId,
        username: "alice",
        email: "alice@example.test",
        role: Roles.User,
        password_hash: "",
        isVerified: true,
        compute_resource_plan_id: "",
        used_compute_resource_id: "",
        course_ids: [],
        owned_vms: [],
        owned_templates: [],
        save: async function () { return this; },
        populate: async function () { return this; },
        ...overrides
    } as any;
}

function makePlan(overrides: Record<string, unknown> = {}) {
    return {
        _id: planId,
        name: "standard",
        max_cpu_cores_per_vm: 4,
        max_memory_per_vm: 8192,
        max_storage_per_vm: 80,
        max_cpu_cores_sum: 8,
        max_memory_sum: 16384,
        max_storage_sum: 160,
        max_vms: 3,
        ...overrides
    } as any;
}

function makeService(options: {
    targetUser?: any | null;
    plan?: any | null;
    listedUsers?: any[];
    repoError?: Error;
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const maybeThrow = () => {
        if (options.repoError) throw options.repoError;
    };
    const service = new SuperAdminUserManagementService({
        repo: {
            findUserById: async (...args) => {
                calls.push({ method: "findUserById", args });
                maybeThrow();
                return options.targetUser === undefined ? makeUser() : options.targetUser;
            },
            findPlanById: async (...args) => {
                calls.push({ method: "findPlanById", args });
                maybeThrow();
                return options.plan === undefined ? makePlan() : options.plan;
            },
            listUsersByRole: async (...args) => {
                calls.push({ method: "listUsersByRole", args });
                maybeThrow();
                return options.listedUsers ?? [makeUser({ role: args[0] })];
            }
        }
    });

    return { calls, service };
}

describe("SuperAdminUserManagementService", () => {
    it("changes assignable target user roles", async () => {
        const targetUser = makeUser();
        const { service, calls } = makeService({ targetUser });

        await expect(service.changeUserRole({
            actor: makeActor(),
            userId,
            newRole: Roles.Admin
        })).resolves.toEqual({
            code: 200,
            message: "User role updated successfully",
            body: undefined
        });

        expect(targetUser.role).toBe(Roles.Admin);
        expect(calls).toEqual([{ method: "findUserById", args: [userId] }]);
    });

    it("rejects invalid role changes before repository access", async () => {
        const { service, calls } = makeService();

        await expect(service.changeUserRole({
            actor: makeActor(),
            userId,
            newRole: Roles.SuperAdmin
        })).resolves.toMatchObject({
            code: 400,
            message: "Invalid or missing 'newRole' field. Can only be 'user' or 'admin'."
        });

        expect(calls).toEqual([]);
    });

    it("blocks changing superadmin target roles", async () => {
        const { service } = makeService({ targetUser: makeUser({ role: Roles.SuperAdmin }) });

        await expect(service.changeUserRole({
            actor: makeActor(),
            userId,
            newRole: Roles.User
        })).resolves.toMatchObject({
            code: 403,
            message: "Cannot change role of a superadmin"
        });
    });

    it("assigns compute resource plans to users", async () => {
        const targetUser = makeUser();
        const { service, calls } = makeService({ targetUser });

        await expect(service.assignCRPToUser({
            actor: makeActor(),
            userId,
            planId
        })).resolves.toEqual({
            code: 200,
            message: "CRP assigned to user successfully",
            body: {
                user: "alice",
                role: Roles.User,
                planId
            }
        });

        expect(targetUser.compute_resource_plan_id).toBe(planId);
        expect(calls.map((call) => call.method)).toEqual(["findUserById", "findPlanById"]);
    });

    it("returns not found when assigning missing users or plans", async () => {
        await expect(makeService({ targetUser: null }).service.assignCRPToUser({
            actor: makeActor(),
            userId,
            planId
        })).resolves.toMatchObject({
            code: 404,
            message: "Target user not found"
        });

        await expect(makeService({ plan: null }).service.assignCRPToUser({
            actor: makeActor(),
            userId,
            planId
        })).resolves.toMatchObject({
            code: 404,
            message: "Compute Resource Plan not found"
        });
    });

    it("lists regular and admin users for verified superadmins", async () => {
        const { service, calls } = makeService();

        await expect(service.listRegularUsers(makeActor())).resolves.toMatchObject({
            code: 200,
            message: "All users retrieved successfully",
            body: [{ role: Roles.User }]
        });
        await expect(service.listAdminUsers(makeActor())).resolves.toMatchObject({
            code: 200,
            message: "All admin users retrieved successfully",
            body: [{ role: Roles.Admin }]
        });

        expect(calls).toEqual([
            { method: "listUsersByRole", args: [Roles.User] },
            { method: "listUsersByRole", args: [Roles.Admin] }
        ]);
    });

    it("blocks user listing for unverified superadmins and reports empty lists", async () => {
        const { service, calls } = makeService({ listedUsers: [] });

        await expect(service.listRegularUsers(makeActor({ isVerified: false }))).resolves.toMatchObject({
            code: 403,
            message: "user is not verified"
        });
        expect(calls).toEqual([]);

        await expect(service.listAdminUsers(makeActor())).resolves.toMatchObject({
            code: 404,
            message: "No admin users found"
        });
    });
});
