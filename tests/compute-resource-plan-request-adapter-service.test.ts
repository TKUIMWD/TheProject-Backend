import { describe, expect, it } from "vitest";
import { ComputeResourcePlanRequestAdapterService } from "../src/modules/crp/ComputeResourcePlanRequestAdapterService";

const user = {
    _id: { toString: () => "user-1" },
    username: "admin"
} as any;

function makeService() {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const plan = {
        name: "basic",
        cpu_cores: 2,
        memory: 2048,
        storage: 20
    } as any;

    const service = new ComputeResourcePlanRequestAdapterService({
        management: {
            createPlan: async (input) => {
                calls.push({ method: "createPlan", args: [input] });
                return { code: 201, message: "created", body: plan };
            },
            updatePlan: async (input) => {
                calls.push({ method: "updatePlan", args: [input] });
                return { code: 200, message: "updated", body: { ...plan, name: "updated" } };
            },
            deletePlan: async (input) => {
                calls.push({ method: "deletePlan", args: [input] });
                return { code: 200, message: "deleted", body: undefined };
            },
            listPlans: async () => {
                calls.push({ method: "listPlans", args: [] });
                return { code: 200, message: "listed", body: [plan] };
            },
            getPlanById: async (planId) => {
                calls.push({ method: "getPlanById", args: [planId] });
                return { code: 200, message: "fetched", body: plan };
            }
        }
    });

    return { calls, service };
}

describe("ComputeResourcePlanRequestAdapterService", () => {
    it("forwards create bodies to CRP management", async () => {
        const { service, calls } = makeService();
        const body = { name: "basic", cpu_cores: 2 };

        await expect(service.createCRP({ user, body })).resolves.toMatchObject({
            code: 201,
            message: "created"
        });

        expect(calls).toEqual([
            {
                method: "createPlan",
                args: [{ user, body }]
            }
        ]);
    });

    it("maps update params and body to CRP management", async () => {
        const { service, calls } = makeService();
        const body = { memory: 4096 };

        await service.updateCRP({
            user,
            params: { crpId: "507f1f77bcf86cd799439011" },
            body
        });

        expect(calls).toEqual([
            {
                method: "updatePlan",
                args: [{
                    user,
                    planId: "507f1f77bcf86cd799439011",
                    body
                }]
            }
        ]);
    });

    it("maps delete params to CRP management", async () => {
        const { service, calls } = makeService();

        await service.deleteCRP({
            user,
            params: { crpId: "507f1f77bcf86cd799439011" }
        });

        expect(calls).toEqual([
            {
                method: "deletePlan",
                args: [{
                    user,
                    planId: "507f1f77bcf86cd799439011"
                }]
            }
        ]);
    });

    it("delegates list without request-shaped data", async () => {
        const { service, calls } = makeService();

        await service.getAllCRPs();

        expect(calls).toEqual([{ method: "listPlans", args: [] }]);
    });

    it("maps get-by-id params to CRP management", async () => {
        const { service, calls } = makeService();

        await service.getCRPById({
            params: { crpId: "507f1f77bcf86cd799439011" }
        });

        expect(calls).toEqual([
            {
                method: "getPlanById",
                args: ["507f1f77bcf86cd799439011"]
            }
        ]);
    });
});
