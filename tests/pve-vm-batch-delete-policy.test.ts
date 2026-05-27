import { describe, expect, it } from "vitest";
import {
    buildPVEVMBatchDeleteItemResult,
    canDeletePVEVM,
    validatePVEVMBatchDeleteInput
} from "../src/modules/pve/PVEVMBatchDeletePolicy";

describe("PVEVMBatchDeletePolicy", () => {
    it("validates and deduplicates batch delete targets", () => {
        expect(validatePVEVMBatchDeleteInput({
            targets: [
                { node: "gapvea", vmid: "101", name: "lab-a" },
                { node: "gapvea", vmid: 101, name: "lab-a duplicate" },
                { node: "gapveb", vmid: 102 }
            ]
        })).toEqual({
            valid: true,
            targets: [
                { node: "gapvea", vmid: 101, name: "lab-a" },
                { node: "gapveb", vmid: 102 }
            ]
        });
    });

    it("rejects unsafe batch delete input", () => {
        expect(validatePVEVMBatchDeleteInput({ targets: [] })).toEqual({
            valid: false,
            message: "Select at least one VM to delete"
        });
        expect(validatePVEVMBatchDeleteInput({ targets: [{ node: "../bad", vmid: "101" }] })).toEqual({
            valid: false,
            message: "target 1 node is invalid"
        });
        expect(validatePVEVMBatchDeleteInput({ targets: [{ node: "gapvea", vmid: "bad" }] })).toEqual({
            valid: false,
            message: "target 1 vmid is invalid"
        });
    });

    it("blocks template and running VMs", () => {
        expect(canDeletePVEVM({ status: "stopped", template: 0 })).toEqual({ allowed: true });
        expect(canDeletePVEVM({ status: "running", template: 0 })).toEqual({
            allowed: false,
            detail: "VM must be stopped before deletion"
        });
        expect(canDeletePVEVM({ status: "stopped", template: 1 })).toEqual({
            allowed: false,
            detail: "Template VMs cannot be deleted from this panel"
        });
    });

    it("builds stable batch delete item results", () => {
        expect(buildPVEVMBatchDeleteItemResult({
            target: { node: "gapvea", vmid: 101, name: "lab-a" },
            ok: true,
            detail: "Delete task submitted",
            upid: "UPID:delete",
            statusBefore: "stopped"
        })).toEqual({
            node: "gapvea",
            vmid: 101,
            name: "lab-a",
            ok: true,
            detail: "Delete task submitted",
            upid: "UPID:delete",
            status_before: "stopped"
        });
    });
});
