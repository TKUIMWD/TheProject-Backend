import { describe, expect, it } from "vitest";
import {
    buildPVEVMOperationResult,
    getPVEVMOperationSuccessMessage,
    validatePVEVMOperationInput,
    validatePVEVMOperationState
} from "../src/modules/pve/PVEVMOperationPolicy";

describe("PVEVMOperationPolicy", () => {
    it("validates dashboard VM operation input", () => {
        expect(validatePVEVMOperationInput({ node: "gapvea", vmid: "101", action: "start" })).toEqual({
            valid: true,
            node: "gapvea",
            vmid: "101",
            action: "start"
        });
        expect(validatePVEVMOperationInput({ node: "../bad", vmid: "101", action: "start" })).toEqual({
            valid: false,
            message: "node is invalid"
        });
        expect(validatePVEVMOperationInput({ node: "gapvea", vmid: "abc", action: "start" })).toEqual({
            valid: false,
            message: "vmid is invalid"
        });
        expect(validatePVEVMOperationInput({ node: "gapvea", vmid: "101", action: "reset" })).toEqual({
            valid: false,
            message: "Unsupported VM operation"
        });
    });

    it("validates operation states before calling PVE", () => {
        expect(validatePVEVMOperationState("start", "running")).toEqual({
            allowed: false,
            message: "VM is already running"
        });
        expect(validatePVEVMOperationState("start", "stopped")).toEqual({ allowed: true });
        expect(validatePVEVMOperationState("shutdown", "stopped")).toEqual({
            allowed: false,
            message: "VM is not running"
        });
        expect(validatePVEVMOperationState("reboot", "stopped")).toEqual({
            allowed: false,
            message: "VM must be running to reboot"
        });
        expect(validatePVEVMOperationState("stop", "running")).toEqual({ allowed: true });
    });

    it("builds stable operation messages and result DTOs", () => {
        expect(getPVEVMOperationSuccessMessage("shutdown")).toBe("VM shutdown task submitted");
        expect(buildPVEVMOperationResult({
            node: "gapvea",
            vmid: "101",
            action: "stop",
            upid: "UPID:stop",
            statusBefore: "running"
        })).toEqual({
            node: "gapvea",
            vmid: 101,
            action: "stop",
            upid: "UPID:stop",
            status_before: "running"
        });
    });
});
