import { describe, expect, it } from "vitest";
import Roles from "../src/enum/role";
import { ComputeResourcePlanManagementService } from "../src/modules/crp/ComputeResourcePlanManagementService";

const userId = "507f1f77bcf86cd79943a001";
const planId = "507f1f77bcf86cd79943a002";

const validPlan = {
    _id: planId,
    name: "standard",
    max_cpu_cores_per_vm: 4,
    max_memory_per_vm: 8192,
    max_storage_per_vm: 80,
    max_cpu_cores_sum: 8,
    max_memory_sum: 16384,
    max_storage_sum: 160,
    max_vms: 3
};

function makeUser(overrides: Record<string, unknown> = {}) {
    return {
        _id: userId,
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

function makePlan(overrides: Record<string, unknown> = {}) {
    return {
        ...validPlan,
        ...overrides
    } as any;
}

function makeService(options: {
    existingByName?: any | null;
    createdPlan?: any;
    updatedPlan?: any | null;
    deletedPlan?: any | null;
    plans?: any[];
    planById?: any | null;
    repoError?: Error;
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const maybeThrow = () => {
        if (options.repoError) throw options.repoError;
    };
    const service = new ComputeResourcePlanManagementService({
        planRepo: {
            findByName: async (...args) => {
                calls.push({ method: "findByName", args });
                maybeThrow();
                return options.existingByName ?? null;
            },
            create: async (...args) => {
                calls.push({ method: "create", args });
                maybeThrow();
                return options.createdPlan ?? makePlan(args[0] as Record<string, unknown>);
            },
            updateById: async (...args) => {
                calls.push({ method: "updateById", args });
                maybeThrow();
                return options.updatedPlan === undefined ? makePlan(args[1] as Record<string, unknown>) : options.updatedPlan;
            },
            deleteById: async (...args) => {
                calls.push({ method: "deleteById", args });
                maybeThrow();
                return options.deletedPlan === undefined ? makePlan() : options.deletedPlan;
            },
            listAll: async (...args) => {
                calls.push({ method: "listAll", args });
                maybeThrow();
                return options.plans ?? [makePlan(), makePlan({ _id: "plan-2", name: "large" })];
            },
            findById: async (...args) => {
                calls.push({ method: "findById", args });
                maybeThrow();
                return options.planById === undefined ? makePlan() : options.planById;
            }
        }
    });

    return { calls, service };
}

describe("ComputeResourcePlanManagementService", () => {
    it("creates a validated compute resource plan", async () => {
        const { service, calls } = makeService();

        await expect(service.createPlan({
            user: makeUser(),
            body: validPlan
        })).resolves.toMatchObject({
            code: 201,
            message: "CRP created successfully",
            body: { name: "standard" }
        });

        expect(calls).toEqual([
            { method: "findByName", args: ["standard"] },
            { method: "create", args: [expect.objectContaining({ name: "standard" })] }
        ]);
    });

    it("rejects invalid create payloads before repository access", async () => {
        const { service, calls } = makeService();

        await expect(service.createPlan({
            user: makeUser(),
            body: { name: "standard" }
        })).resolves.toEqual({
            code: 400,
            message: "Bad Request: Missing required field 'max_cpu_cores_per_vm'",
            body: undefined
        });

        expect(calls).toEqual([]);
    });

    it("rejects duplicate plan names on create", async () => {
        const { service, calls } = makeService({ existingByName: makePlan() });

        await expect(service.createPlan({
            user: makeUser(),
            body: validPlan
        })).resolves.toEqual({
            code: 409,
            message: 'Conflict: CRP with name "standard" already exists',
            body: undefined
        });

        expect(calls.map((call) => call.method)).not.toContain("create");
    });

    it("updates a plan after ID and partial payload validation", async () => {
        const { service, calls } = makeService();

        await expect(service.updatePlan({
            user: makeUser(),
            planId,
            body: { name: "upgraded", max_vms: 5 }
        })).resolves.toMatchObject({
            code: 200,
            message: "CRP updated successfully",
            body: { name: "upgraded", max_vms: 5 }
        });

        expect(calls).toEqual([
            { method: "updateById", args: [planId, { name: "upgraded", max_vms: 5 }] }
        ]);
    });

    it("returns not found for missing updates and deletes", async () => {
        const updateService = makeService({ updatedPlan: null }).service;
        await expect(updateService.updatePlan({
            user: makeUser(),
            planId,
            body: { max_vms: 5 }
        })).resolves.toMatchObject({
            code: 404,
            message: "Not Found: CRP not found"
        });

        const deleteService = makeService({ deletedPlan: null }).service;
        await expect(deleteService.deletePlan({
            user: makeUser(),
            planId
        })).resolves.toMatchObject({
            code: 404,
            message: "Not Found: CRP not found"
        });
    });

    it("deletes plans by validated ID", async () => {
        const { service, calls } = makeService();

        await expect(service.deletePlan({
            user: makeUser(),
            planId
        })).resolves.toEqual({
            code: 200,
            message: "CRP deleted successfully",
            body: undefined
        });

        expect(calls).toEqual([{ method: "deleteById", args: [planId] }]);
    });

    it("lists and retrieves plans", async () => {
        const { service, calls } = makeService();

        await expect(service.listPlans()).resolves.toMatchObject({
            code: 200,
            message: "CRPs retrieved successfully",
            body: [{ name: "standard" }, { name: "large" }]
        });

        await expect(service.getPlanById(planId)).resolves.toMatchObject({
            code: 200,
            message: "CRP retrieved successfully",
            body: { name: "standard" }
        });

        expect(calls.map((call) => call.method)).toEqual(["listAll", "findById"]);
    });

    it("validates IDs before repository calls", async () => {
        const { service, calls } = makeService();

        await expect(service.getPlanById("bad-id")).resolves.toEqual({
            code: 400,
            message: "Invalid crpId format",
            body: undefined
        });

        expect(calls).toEqual([]);
    });
});
