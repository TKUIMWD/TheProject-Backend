import { describe, expect, it } from "vitest";
import {
    getVMConfigOperationMetadata,
    normalizeVMConfigOperationError
} from "../src/modules/vm/VMConfigOperationPolicy";

describe("VMConfigOperationPolicy", () => {
    it("returns stable metadata for VM config operations", () => {
        expect(getVMConfigOperationMetadata("name")).toEqual({
            waitLabel: "VM name update",
            completedMessage: "VM name update completed"
        });
        expect(getVMConfigOperationMetadata("cpu")).toEqual({
            waitLabel: "CPU configuration",
            completedMessage: "CPU configuration completed"
        });
        expect(getVMConfigOperationMetadata("memory")).toEqual({
            waitLabel: "Memory configuration",
            completedMessage: "Memory configuration completed"
        });
        expect(getVMConfigOperationMetadata("disk")).toEqual({
            waitLabel: "Disk resize",
            completedMessage: "Disk resize completed"
        });
        expect(getVMConfigOperationMetadata("cloudInit")).toEqual({
            waitLabel: "Cloud-Init configuration",
            completedMessage: "Cloud-Init configuration completed"
        });
    });

    it("normalizes caught operation errors", () => {
        expect(normalizeVMConfigOperationError(new Error("PVE failed"))).toBe("PVE failed");
        expect(normalizeVMConfigOperationError("bad")).toBe("Unknown error");
    });
});
