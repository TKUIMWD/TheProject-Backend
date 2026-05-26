import { describe, expect, it } from "vitest";
import { validateComputeResourcePlanInput } from "../src/modules/crp/ComputeResourcePlanPolicy";

const validPlan = {
    name: "standard",
    max_cpu_cores_per_vm: 4,
    max_memory_per_vm: 8192,
    max_storage_per_vm: 80,
    max_cpu_cores_sum: 8,
    max_memory_sum: 16384,
    max_storage_sum: 160,
    max_vms: 3
};

describe("validateComputeResourcePlanInput", () => {
    it("accepts a complete valid plan", () => {
        expect(validateComputeResourcePlanInput(validPlan)).toEqual({
            valid: true,
            value: validPlan
        });
    });

    it("requires all fields for create", () => {
        expect(validateComputeResourcePlanInput({ name: "standard" })).toEqual({
            valid: false,
            message: "Missing required field 'max_cpu_cores_per_vm'"
        });
    });

    it("rejects empty names and non-positive resource limits", () => {
        expect(validateComputeResourcePlanInput({ ...validPlan, name: "   " })).toEqual({
            valid: false,
            message: "name cannot be empty"
        });
        expect(validateComputeResourcePlanInput({ ...validPlan, max_vms: 0 })).toEqual({
            valid: false,
            message: "max_vms must be a positive number"
        });
    });

    it("rejects per-VM limits that exceed total limits on create", () => {
        expect(validateComputeResourcePlanInput({ ...validPlan, max_cpu_cores_per_vm: 16 })).toEqual({
            valid: false,
            message: "max_cpu_cores_per_vm cannot exceed max_cpu_cores_sum"
        });
    });

    it("accepts partial updates with whitelisted fields", () => {
        expect(validateComputeResourcePlanInput({ name: "  upgraded  ", max_vms: 5 }, { partial: true })).toEqual({
            valid: true,
            value: {
                name: "upgraded",
                max_vms: 5
            }
        });
    });

    it("rejects partial updates without valid fields", () => {
        expect(validateComputeResourcePlanInput({ ignored: "field" }, { partial: true })).toEqual({
            valid: false,
            message: "No valid CRP fields to update"
        });
    });
});

