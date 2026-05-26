import { describe, expect, it } from "vitest";
import {
    buildVMDeletionErrorResponse,
    buildVMDeletionPVEApiFailureMessage,
    buildVMDeletionSuccessResponse,
    canDeleteVMByOwnership,
    checkVMDeletionPowerState,
    classifyVMDeletionResponse
} from "../src/modules/vm/VMDeletionPolicy";

describe("VMDeletionPolicy", () => {
    it("allows superadmins to delete any VM", () => {
        expect(canDeleteVMByOwnership({
            tokenRole: "superadmin",
            ownedVmIds: [],
            vmId: "vm-1"
        })).toEqual({ allowed: true });
    });

    it("allows regular users to delete owned VMs", () => {
        expect(canDeleteVMByOwnership({
            tokenRole: "user",
            ownedVmIds: ["vm-1", "vm-2"],
            vmId: "vm-2"
        })).toEqual({ allowed: true });
    });

    it("rejects regular users deleting VMs they do not own", () => {
        expect(canDeleteVMByOwnership({
            tokenRole: "user",
            ownedVmIds: ["vm-1"],
            vmId: "vm-2"
        })).toEqual({
            allowed: false,
            message: "Access denied: VM not owned by user"
        });
    });

    it("prevents deletion while a VM is running", () => {
        expect(checkVMDeletionPowerState({ status: "running" })).toEqual({
            allowed: false,
            message: "VM is currently running. Please stop the VM before deletion."
        });
    });

    it("allows deletion when VM status is stopped, unknown, or unavailable", () => {
        expect(checkVMDeletionPowerState({ status: "stopped" })).toEqual({ allowed: true });
        expect(checkVMDeletionPowerState({ status: "unknown" })).toEqual({ allowed: true });
        expect(checkVMDeletionPowerState(null)).toEqual({ allowed: true });
    });

    it("builds PVE API failure messages for invalid JSON responses", () => {
        expect(buildVMDeletionPVEApiFailureMessage(new SyntaxError("Unexpected token < in JSON"))).toBe(
            "PVE API returned invalid JSON response: Unexpected token < in JSON"
        );
    });

    it("builds PVE API failure messages for general errors", () => {
        expect(buildVMDeletionPVEApiFailureMessage(new Error("connection refused"))).toBe(
            "PVE API call failed: connection refused"
        );

        expect(buildVMDeletionPVEApiFailureMessage("boom")).toBe(
            "PVE API call failed: Unknown error"
        );
    });

    it("classifies UPID strings as async deletion tasks", () => {
        expect(classifyVMDeletionResponse({ data: "UPID:pve:1" } as any)).toEqual({
            success: true,
            mode: "task",
            taskId: "UPID:pve:1"
        });
    });

    it("classifies null data as immediate deletion success", () => {
        expect(classifyVMDeletionResponse({ data: null } as any)).toEqual({
            success: true,
            mode: "immediate"
        });
    });

    it("rejects missing or empty PVE delete responses", () => {
        expect(classifyVMDeletionResponse(undefined)).toEqual({
            success: false,
            errorMessage: "PVE API returned no response or invalid response"
        });
        expect(classifyVMDeletionResponse({} as any)).toEqual({
            success: false,
            errorMessage: "PVE API response missing data property"
        });
    });

    it("rejects unexpected PVE delete response data types", () => {
        expect(classifyVMDeletionResponse({ data: { upid: "UPID:pve:1" } } as any)).toEqual({
            success: false,
            errorMessage: "Unexpected PVE API response data type: object"
        });
        expect(classifyVMDeletionResponse({ data: true } as any)).toEqual({
            success: false,
            errorMessage: "Unexpected PVE API response data type: boolean"
        });
    });

    it("builds VM deletion success response bodies", () => {
        expect(buildVMDeletionSuccessResponse({
            vmId: "vm-1",
            pveVmid: "120",
            pveNode: "pve-a"
        })).toEqual({
            vm_id: "vm-1",
            pve_vmid: "120",
            pve_node: "pve-a",
            message: "VM deleted successfully"
        });

        expect(buildVMDeletionSuccessResponse({
            vmId: "vm-1",
            pveVmid: "120",
            pveNode: "pve-a",
            taskId: "UPID:pve:1"
        })).toEqual({
            vm_id: "vm-1",
            pve_vmid: "120",
            pve_node: "pve-a",
            task_id: "UPID:pve:1",
            message: "VM deletion task completed successfully"
        });
    });

    it("builds VM deletion error response bodies", () => {
        expect(buildVMDeletionErrorResponse({
            vmId: "vm-1",
            pveVmid: "120",
            pveNode: "pve-a",
            error: new Error("PVE unavailable")
        })).toEqual({
            vm_id: "vm-1",
            pve_vmid: "120",
            pve_node: "pve-a",
            message: "PVE unavailable"
        });

        expect(buildVMDeletionErrorResponse({
            vmId: "vm-1",
            pveVmid: "120",
            pveNode: "pve-a",
            error: "boom"
        })).toEqual({
            vm_id: "vm-1",
            pve_vmid: "120",
            pve_node: "pve-a",
            message: "Unknown error"
        });
    });
});
