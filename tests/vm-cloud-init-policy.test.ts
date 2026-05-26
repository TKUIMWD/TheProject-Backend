import { describe, expect, it } from "vitest";
import {
    hasValidCloudInitTemplateValue,
    selectCloudInitCredentials,
    validateCloudInitUpdateInput
} from "../src/modules/vm/VMCloudInitPolicy";

describe("VMCloudInitPolicy", () => {
    it("recognizes usable template cloud-init values", () => {
        expect(hasValidCloudInitTemplateValue("student")).toBe(true);
        expect(hasValidCloudInitTemplateValue("  ")).toBe(false);
        expect(hasValidCloudInitTemplateValue("undefined")).toBe(false);
        expect(hasValidCloudInitTemplateValue("null")).toBe(false);
        expect(hasValidCloudInitTemplateValue(undefined)).toBe(false);
    });

    it("uses template credentials when request fields are absent", () => {
        expect(selectCloudInitCredentials({
            templateCiuser: "student",
            templateCipassword: "secret"
        })).toEqual({
            ciuser: "student",
            cipassword: "secret",
            templateHasValidCiuser: true,
            templateHasValidCipassword: true,
            ciuserFromTemplate: true,
            cipasswordFromTemplate: true
        });
    });

    it("lets explicit request values override template defaults", () => {
        expect(selectCloudInitCredentials({
            requestCiuser: "admin",
            requestCipassword: "override",
            templateCiuser: "student",
            templateCipassword: "secret"
        })).toMatchObject({
            ciuser: "admin",
            cipassword: "override",
            ciuserFromTemplate: false,
            cipasswordFromTemplate: false
        });
    });

    it("treats explicit empty request values as overrides", () => {
        expect(selectCloudInitCredentials({
            requestCiuser: "",
            requestCipassword: "",
            templateCiuser: "student",
            templateCipassword: "secret"
        })).toMatchObject({
            ciuser: "",
            cipassword: "",
            ciuserFromTemplate: false,
            cipasswordFromTemplate: false
        });
    });

    it("allows update requests without cloud-init fields", () => {
        expect(validateCloudInitUpdateInput({})).toEqual({ valid: true });
    });

    it("requires update ciuser and cipassword together and non-empty", () => {
        expect(validateCloudInitUpdateInput({ requestCiuser: "student" })).toEqual({
            valid: false,
            message: "Both ciuser and cipassword must be provided and non-empty"
        });
        expect(validateCloudInitUpdateInput({ requestCiuser: "", requestCipassword: "" })).toEqual({
            valid: false,
            message: "Both ciuser and cipassword must be provided and non-empty"
        });
        expect(validateCloudInitUpdateInput({ requestCiuser: "student", requestCipassword: "secret" })).toEqual({
            valid: true
        });
    });
});
