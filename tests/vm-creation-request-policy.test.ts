import { describe, expect, it } from "vitest";
import {
    buildVMCreationIdentityPolicy,
    buildVMCreationValidationParams
} from "../src/modules/vm/VMCreationRequestPolicy";
import { INVALID_VM_NAME_MESSAGE } from "../src/modules/vm/VMCreationResponsePolicy";

describe("VMCreationRequestPolicy", () => {
    it("builds stable VM creation validation params for VMUtils", () => {
        expect(buildVMCreationValidationParams({
            templateId: "template-1",
            name: "Web Lab",
            target: "pve-a",
            cpuCores: 2,
            memorySize: 4096,
            diskSize: 32,
            ciuser: "student",
            cipassword: "secret"
        })).toEqual({
            template_id: "template-1",
            name: "Web Lab",
            target: "pve-a",
            cpuCores: 2,
            memorySize: 4096,
            diskSize: 32,
            ciuser: "student",
            cipassword: "secret"
        });
    });

    it("keeps absent cloud-init values as explicit undefined validation fields", () => {
        expect(buildVMCreationValidationParams({
            templateId: "template-1",
            name: "Box Lab",
            target: "pve-b",
            cpuCores: 1,
            memorySize: 2048,
            diskSize: 20
        })).toEqual({
            template_id: "template-1",
            name: "Box Lab",
            target: "pve-b",
            cpuCores: 1,
            memorySize: 2048,
            diskSize: 20,
            ciuser: undefined,
            cipassword: undefined
        });
    });

    it("builds sanitized VM identity from next-id and display name", () => {
        expect(buildVMCreationIdentityPolicy({
            nextId: 120,
            name: "My Box_01!!"
        })).toEqual({
            valid: true,
            nextId: "120",
            sanitizedName: "my-box-01"
        });
    });

    it("rejects names that sanitize to an empty VM name", () => {
        expect(buildVMCreationIdentityPolicy({
            nextId: "120",
            name: "..."
        })).toEqual({
            valid: false,
            message: INVALID_VM_NAME_MESSAGE
        });
    });
});
