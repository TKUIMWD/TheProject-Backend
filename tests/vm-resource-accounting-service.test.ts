import { describe, expect, it } from "vitest";
import { ComputeResourcePlan } from "../src/interfaces/ComputeResourcePlan";
import { UsedComputeResource } from "../src/interfaces/UesdComputeResource";
import { User } from "../src/interfaces/User";
import { VMResourceAccountingService } from "../src/modules/vm/VMResourceAccountingService";

const plan: ComputeResourcePlan = {
    name: "standard",
    max_cpu_cores_per_vm: 4,
    max_memory_per_vm: 8192,
    max_storage_per_vm: 80,
    max_cpu_cores_sum: 8,
    max_memory_sum: 16384,
    max_storage_sum: 160,
    max_vms: 4
};

const usedResources: UsedComputeResource = {
    cpu_cores: 3,
    memory: 4096,
    storage: 80
};

const user = {
    _id: "user-1",
    compute_resource_plan_id: "plan-1",
    used_compute_resource_id: "used-1"
} as User;

function makeService(options: {
    computePlan?: ComputeResourcePlan | null;
    used?: UsedComputeResource | null;
    updateResult?: boolean;
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const repository = {
        applyUsedResourceUpdateForUser: async (userId: string, update: unknown) => {
            calls.push({ method: "applyUsedResourceUpdateForUser", args: [userId, update] });
            return options.updateResult ?? true;
        },
        getOrCreateUsedResources: async (requestUser: User) => {
            calls.push({ method: "getOrCreateUsedResources", args: [requestUser] });
            return Object.prototype.hasOwnProperty.call(options, "used") ? options.used : usedResources;
        },
        findComputeResourcePlan: async (planId: string) => {
            calls.push({ method: "findComputeResourcePlan", args: [planId] });
            return Object.prototype.hasOwnProperty.call(options, "computePlan") ? options.computePlan : plan;
        }
    };

    return {
        calls,
        service: new VMResourceAccountingService(repository)
    };
}

describe("VMResourceAccountingService", () => {
    it("increments used resources with the policy-built update payload", async () => {
        const { service, calls } = makeService();

        await service.incrementUsage("user-1", 2, 4096, 40);

        expect(calls).toEqual([
            {
                method: "applyUsedResourceUpdateForUser",
                args: [
                    "user-1",
                    {
                        $inc: {
                            cpu_cores: 2,
                            memory: 4096,
                            storage: 40
                        }
                    }
                ]
            }
        ]);
    });

    it("reclaims resources from a VM config", async () => {
        const { service, calls } = makeService();

        await service.reclaimWithConfig("user-1", {
            cores: 2,
            memory: "4096",
            scsi0: "local-lvm:vm-101-disk-0.qcow2,size=40G"
        } as any);

        expect(calls).toEqual([
            {
                method: "applyUsedResourceUpdateForUser",
                args: [
                    "user-1",
                    {
                        $inc: {
                            cpu_cores: -2,
                            memory: -4096,
                            storage: -40
                        }
                    }
                ]
            }
        ]);
    });

    it("passes create-limit checks when plan and used resources allow the VM", async () => {
        const { service, calls } = makeService();

        await expect(service.checkCreateLimits(user, 2, 4096, 40)).resolves.toMatchObject({
            code: 200,
            message: "Resource limits check passed"
        });

        expect(calls).toEqual([
            { method: "findComputeResourcePlan", args: ["plan-1"] },
            { method: "getOrCreateUsedResources", args: [user] }
        ]);
    });

    it("rejects create-limit checks when the compute plan is missing", async () => {
        const { service, calls } = makeService({ computePlan: null });

        await expect(service.checkCreateLimits(user, 2, 4096, 40)).resolves.toMatchObject({
            code: 404,
            message: "Compute resource plan not found"
        });

        expect(calls).toEqual([
            { method: "findComputeResourcePlan", args: ["plan-1"] }
        ]);
    });

    it("rejects update-limit checks when resource increases exceed available limits", async () => {
        const { service } = makeService();

        await expect(service.checkUpdateLimits({
            user,
            cpuDelta: 6,
            memoryDelta: 0,
            diskDelta: 0,
            newCpuCores: 4,
            newMemorySize: 4096,
            newDiskSize: 40
        })).resolves.toMatchObject({
            code: 400,
            message: expect.stringContaining("resource increases")
        });
    });
});
