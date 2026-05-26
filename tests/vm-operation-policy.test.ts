import { describe, expect, it } from "vitest";
import {
    canOperateVM,
    getVMOperationMessages,
    validateVMOperationState,
    validateVMOperationTargetId
} from "../src/modules/vm/VMOperationPolicy";

describe("VMOperationPolicy", () => {
    it("validates VM operation target IDs", () => {
        expect(validateVMOperationTargetId("")).toEqual({ valid: false, message: "VM ID is required" });
        expect(validateVMOperationTargetId(undefined)).toEqual({ valid: false, message: "VM ID is required" });
        expect(validateVMOperationTargetId("not-an-object-id")).toEqual({ valid: false, message: "Invalid VM ID format" });
        expect(validateVMOperationTargetId("507f1f77bcf86cd799439011")).toEqual({
            valid: true,
            vmId: "507f1f77bcf86cd799439011"
        });
    });

    it("allows owners and super admins to operate a VM", () => {
        expect(canOperateVM("user-1", "user-1", false)).toBe(true);
        expect(canOperateVM("user-1", "admin-1", true)).toBe(true);
    });

    it("rejects non-owners who are not super admins", () => {
        expect(canOperateVM("user-1", "user-2", false)).toBe(false);
    });

    it("prevents booting an already-running VM", () => {
        expect(validateVMOperationState("boot", "running")).toEqual({
            allowed: false,
            message: "VM is already running"
        });
    });

    it("requires running state for shutdown and poweroff", () => {
        expect(validateVMOperationState("shutdown", "stopped")).toEqual({
            allowed: false,
            message: "VM is not running"
        });
        expect(validateVMOperationState("poweroff", "stopped")).toEqual({
            allowed: false,
            message: "VM is not running"
        });
    });

    it("requires running state for reboot and reset", () => {
        expect(validateVMOperationState("reboot", "stopped")).toEqual({
            allowed: false,
            message: "VM must be running to reboot"
        });
        expect(validateVMOperationState("reset", "stopped")).toEqual({
            allowed: false,
            message: "VM must be running to reset"
        });
    });

    it("allows valid operation states", () => {
        expect(validateVMOperationState("boot", "stopped")).toEqual({ allowed: true });
        expect(validateVMOperationState("shutdown", "running")).toEqual({ allowed: true });
        expect(validateVMOperationState("poweroff", "running")).toEqual({ allowed: true });
        expect(validateVMOperationState("reboot", "running")).toEqual({ allowed: true });
        expect(validateVMOperationState("reset", "running")).toEqual({ allowed: true });
    });

    it("returns stable user-facing messages for each operation", () => {
        expect(getVMOperationMessages("boot")).toEqual({
            actionLabel: "start",
            successLogLabel: "started",
            successMessage: "VM started successfully",
            failureMessage: "Failed to start VM",
            waitTaskLabel: "VM start",
            waitFailureMessage: "VM start task failed"
        });
        expect(getVMOperationMessages("shutdown").successMessage).toBe("VM shutdown initiated successfully");
        expect(getVMOperationMessages("poweroff").failureMessage).toBe("Failed to poweroff VM");
        expect(getVMOperationMessages("reboot").successLogLabel).toBe("rebooted");
        expect(getVMOperationMessages("reset").successMessage).toBe("VM reset successfully");
    });
});
