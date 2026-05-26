import { describe, expect, it } from "vitest";
import {
    buildCreateConnectionPermissionPatchOperations,
    buildGuacamoleUserCreatePayload,
    classifyGuacamoleUserLookupResponse,
    classifyGuacamoleUserMutationResponse,
    evaluateCreateConnectionPermission
} from "../src/modules/guacamole/GuacamoleUserPolicy";

describe("GuacamoleUserPolicy", () => {
    it("classifies Guacamole user lookup responses", () => {
        const user = { username: "user@example.test" };

        expect(classifyGuacamoleUserLookupResponse(user)).toEqual({
            exists: true,
            user
        });

        expect(classifyGuacamoleUserLookupResponse({ type: "NOT_FOUND" })).toEqual({
            exists: false
        });

        expect(classifyGuacamoleUserLookupResponse({ error: "missing" })).toEqual({
            exists: false
        });
    });

    it("builds Guacamole user creation payloads", () => {
        expect(buildGuacamoleUserCreatePayload("user@example.test", "secret")).toEqual({
            username: "user@example.test",
            password: "secret",
            attributes: {
                "guac-full-name": "user@example.test",
                "guac-email-address": "user@example.test"
            }
        });
    });

    it("classifies successful user mutation responses", () => {
        expect(classifyGuacamoleUserMutationResponse(undefined, "Permissions set successfully")).toEqual({
            success: true,
            message: "Permissions set successfully"
        });

        expect(classifyGuacamoleUserMutationResponse({ type: "SUCCESS" }, "User created")).toEqual({
            success: true,
            message: "User created"
        });
    });

    it("classifies Guacamole user mutation failures", () => {
        expect(classifyGuacamoleUserMutationResponse({
            type: "BAD_REQUEST",
            message: "username already exists"
        }, "User created")).toEqual({
            success: false,
            message: "username already exists"
        });

        expect(classifyGuacamoleUserMutationResponse({ type: "INTERNAL_ERROR" }, "User created")).toEqual({
            success: false,
            message: "INTERNAL_ERROR"
        });
    });

    it("builds CREATE_CONNECTION permission patch operations", () => {
        expect(buildCreateConnectionPermissionPatchOperations()).toEqual([
            {
                op: "add",
                path: "/systemPermissions",
                value: "CREATE_CONNECTION"
            }
        ]);
    });

    it("evaluates CREATE_CONNECTION permission state", () => {
        expect(evaluateCreateConnectionPermission({
            systemPermissions: ["CREATE_CONNECTION"]
        })).toEqual({
            hasPermissions: true,
            message: "User has connection creation permissions"
        });

        expect(evaluateCreateConnectionPermission({
            systemPermissions: ["ADMINISTER"]
        })).toEqual({
            hasPermissions: false,
            message: "User missing CREATE_CONNECTION permission"
        });

        expect(evaluateCreateConnectionPermission({})).toEqual({
            hasPermissions: false,
            message: "User missing CREATE_CONNECTION permission"
        });
    });
});
