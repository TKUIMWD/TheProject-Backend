import { describe, expect, it } from "vitest";
import {
    buildVMCreationSuccessBody,
    INVALID_VM_NAME_MESSAGE,
    VM_CLONE_FAILURE_MESSAGE,
    VM_CONFIGURATION_CLEANED_UP_FAILURE_MESSAGE,
    VM_CREATION_SUCCESS_MESSAGE
} from "../src/modules/vm/VMCreationResponsePolicy";

describe("VMCreationResponsePolicy", () => {
    it("keeps VM creation response messages stable", () => {
        expect(INVALID_VM_NAME_MESSAGE).toBe("Invalid VM name. Name must contain only alphanumeric characters, hyphens, and dots, and cannot start or end with a hyphen.");
        expect(VM_CLONE_FAILURE_MESSAGE).toBe("Failed to clone VM from template");
        expect(VM_CREATION_SUCCESS_MESSAGE).toBe("VM created and configured successfully");
        expect(VM_CONFIGURATION_CLEANED_UP_FAILURE_MESSAGE).toBe("VM created but configuration failed, resources have been cleaned up");
    });

    it("builds the VM creation success response body", () => {
        expect(buildVMCreationSuccessBody({
            taskId: "task-1",
            vmName: "web-lab",
            vmid: "120"
        })).toEqual({
            task_id: "task-1",
            vm_name: "web-lab",
            vmid: "120"
        });
    });
});
