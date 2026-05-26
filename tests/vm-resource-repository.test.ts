import { describe, expect, it } from "vitest";
import { VMResourceRepository } from "../src/modules/vm/VMResourceRepository";

function makeRepository(options: {
    user?: any;
    existingUsedResource?: any;
    computePlan?: any;
} = {}) {
    const calls: Array<{ target: string; method: string; args: unknown[] }> = [];
    const createdResource = {
        _id: { toString: () => "resource-created" },
        cpu_cores: 0,
        memory: 0,
        storage: 0
    };

    const usersModel = {
        findById: (id: string) => {
            calls.push({ target: "users", method: "findById", args: [id] });
            return {
                exec: async () => options.user ?? {
                    _id: "user-1",
                    used_compute_resource_id: "resource-1"
                }
            };
        },
        updateOne: async (query: unknown, update: unknown) => {
            calls.push({ target: "users", method: "updateOne", args: [query, update] });
            return { acknowledged: true, matchedCount: 1, modifiedCount: 1 } as any;
        }
    };

    const usedResourceModel = {
        findById: (id: string) => {
            calls.push({ target: "used", method: "findById", args: [id] });
            return {
                exec: async () => Object.prototype.hasOwnProperty.call(options, "existingUsedResource")
                    ? options.existingUsedResource
                    : {
                        _id: id,
                        cpu_cores: 1,
                        memory: 1024,
                        storage: 20
                    }
            };
        },
        create: async (payload: any) => {
            calls.push({ target: "used", method: "create", args: [payload] });
            return createdResource;
        },
        updateOne: async (query: unknown, update: unknown) => {
            calls.push({ target: "used", method: "updateOne", args: [query, update] });
            return { acknowledged: true, matchedCount: 1, modifiedCount: 1 } as any;
        }
    };

    const computeResourcePlanModel = {
        findOne: (query: unknown) => {
            calls.push({ target: "plan", method: "findOne", args: [query] });
            return {
                exec: async () => options.computePlan ?? { _id: "plan-1", name: "standard" }
            };
        }
    };

    return {
        calls,
        repository: new VMResourceRepository(usersModel as any, usedResourceModel as any, computeResourcePlanModel as any)
    };
}

describe("VMResourceRepository", () => {
    it("applies used-resource updates through the user's resource ID", async () => {
        const { repository, calls } = makeRepository();
        const update = { $inc: { cpu_cores: 2 } };

        await expect(repository.applyUsedResourceUpdateForUser("user-1", update)).resolves.toBe(true);

        expect(calls).toEqual([
            { target: "users", method: "findById", args: ["user-1"] },
            {
                target: "used",
                method: "updateOne",
                args: [
                    { _id: "resource-1" },
                    update
                ]
            }
        ]);
    });

    it("skips used-resource updates when the user has no resource ID", async () => {
        const { repository, calls } = makeRepository({
            user: { _id: "user-1", used_compute_resource_id: "" }
        });

        await expect(repository.applyUsedResourceUpdateForUser("user-1", { $inc: { cpu_cores: 1 } })).resolves.toBe(false);

        expect(calls).toEqual([
            { target: "users", method: "findById", args: ["user-1"] }
        ]);
    });

    it("returns existing used resources when the user already has a valid resource record", async () => {
        const { repository, calls } = makeRepository();

        await expect(repository.getOrCreateUsedResources({
            _id: "user-1",
            used_compute_resource_id: "resource-1"
        } as any)).resolves.toMatchObject({
            _id: "resource-1",
            cpu_cores: 1
        });

        expect(calls).toEqual([
            { target: "used", method: "findById", args: ["resource-1"] }
        ]);
    });

    it("creates and attaches used resources when no resource record exists", async () => {
        const { repository, calls } = makeRepository({
            existingUsedResource: null
        });

        await expect(repository.getOrCreateUsedResources({
            _id: "user-1",
            used_compute_resource_id: "missing-resource"
        } as any)).resolves.toMatchObject({
            cpu_cores: 0,
            memory: 0,
            storage: 0
        });

        expect(calls).toEqual([
            { target: "used", method: "findById", args: ["missing-resource"] },
            {
                target: "used",
                method: "create",
                args: [{ cpu_cores: 0, memory: 0, storage: 0 }]
            },
            {
                target: "users",
                method: "updateOne",
                args: [
                    { _id: "user-1" },
                    { used_compute_resource_id: "resource-created" }
                ]
            }
        ]);
    });

    it("finds compute resource plans by ID", async () => {
        const { repository, calls } = makeRepository();

        await expect(repository.findComputeResourcePlan("plan-1")).resolves.toMatchObject({
            _id: "plan-1",
            name: "standard"
        });

        expect(calls).toEqual([
            { target: "plan", method: "findOne", args: [{ _id: "plan-1" }] }
        ]);
    });
});
