import { describe, expect, it } from "vitest";
import { ComputeResourcePlan } from "../src/interfaces/ComputeResourcePlan";
import { UsedComputeResource } from "../src/interfaces/UesdComputeResource";
import {
    buildAttachUsedComputeResourceUpdate,
    buildInitialUsedComputeResource,
    buildVMResourceReclaimUpdate,
    buildVMResourceUsageIncrementUpdate,
    checkVMCreateResourcePolicy,
    checkVMUpdateResourcePolicy
} from "../src/modules/vm/VMResourcePolicy";

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

const used: UsedComputeResource = {
    cpu_cores: 3,
    memory: 4096,
    storage: 100
};

describe("VMResourcePolicy", () => {
    it("builds initial used-resource persistence payloads", () => {
        expect(buildInitialUsedComputeResource()).toEqual({
            cpu_cores: 0,
            memory: 0,
            storage: 0
        });
        expect(buildAttachUsedComputeResourceUpdate({ toString: () => "resource-1" })).toEqual({
            used_compute_resource_id: "resource-1"
        });
    });

    it("builds resource usage increment payloads", () => {
        expect(buildVMResourceUsageIncrementUpdate({
            cpuCores: 2,
            memorySize: 4096,
            diskSize: 40
        })).toEqual({
            $inc: {
                cpu_cores: 2,
                memory: 4096,
                storage: 40
            }
        });
    });

    it("builds resource reclaim payloads", () => {
        expect(buildVMResourceReclaimUpdate({
            cpuCores: 2,
            memorySize: "4096",
            diskSize: "40"
        })).toEqual({
            $inc: {
                cpu_cores: -2,
                memory: -4096,
                storage: -40
            }
        });

        expect(buildVMResourceReclaimUpdate({
            cpuCores: 2,
            memorySize: 4096,
            diskSize: null
        })).toEqual({
            $inc: {
                cpu_cores: -2,
                memory: -4096,
                storage: 0
            }
        });
    });

    it("allows VM creation within per-VM and total limits", () => {
        const result = checkVMCreateResourcePolicy(plan, used, {
            cpuCores: 2,
            memorySize: 4096,
            diskSize: 40
        });

        expect(result).toEqual({
            allowed: true,
            message: "Resource limits check passed"
        });
    });

    it("rejects VM creation above per-VM limits", () => {
        const result = checkVMCreateResourcePolicy(plan, used, {
            cpuCores: 5,
            memorySize: 4096,
            diskSize: 40
        });

        expect(result.allowed).toBe(false);
        expect(result.message).toContain("per VM");
    });

    it("rejects VM creation above available total limits", () => {
        const result = checkVMCreateResourcePolicy(plan, used, {
            cpuCores: 2,
            memorySize: 4096,
            diskSize: 70
        });

        expect(result.allowed).toBe(false);
        expect(result.message).toContain("available limits");
    });

    it("allows VM update when deltas do not increase resources", () => {
        const result = checkVMUpdateResourcePolicy(plan, used, {
            cpuDelta: -1,
            memoryDelta: 0,
            diskDelta: 0,
            newCpuCores: 2,
            newMemorySize: 4096,
            newDiskSize: 40
        });

        expect(result.allowed).toBe(true);
    });

    it("rejects VM update above available delta limits", () => {
        const result = checkVMUpdateResourcePolicy(plan, used, {
            cpuDelta: 6,
            memoryDelta: 0,
            diskDelta: 0,
            newCpuCores: 4,
            newMemorySize: 4096,
            newDiskSize: 40
        });

        expect(result.allowed).toBe(false);
        expect(result.message).toContain("resource increases");
    });
});
