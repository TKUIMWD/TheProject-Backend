import { describe, expect, it } from "vitest";
import {
    validateGuacamoleConnectionId,
    validateGuacamoleConnectionTarget
} from "../src/modules/guacamole/GuacamoleConnectionRequestPolicy";

describe("validateGuacamoleConnectionTarget", () => {
    it("normalizes VM IDs and uses protocol default ports", () => {
        expect(validateGuacamoleConnectionTarget({
            vm_id: " 507f1f77bcf86cd799439011 "
        }, "ssh")).toEqual({
            valid: true,
            vmId: "507f1f77bcf86cd799439011",
            port: 22
        });

        expect(validateGuacamoleConnectionTarget({
            vm_id: "507f1f77bcf86cd799439011"
        }, "rdp")).toEqual({
            valid: true,
            vmId: "507f1f77bcf86cd799439011",
            port: 3389
        });
    });

    it("accepts numeric string ports", () => {
        expect(validateGuacamoleConnectionTarget({
            vm_id: "507f1f77bcf86cd799439011",
            port: "5901"
        }, "vnc")).toEqual({
            valid: true,
            vmId: "507f1f77bcf86cd799439011",
            port: 5901
        });
    });

    it("rejects invalid VM IDs", () => {
        expect(validateGuacamoleConnectionTarget({
            vm_id: "bad-id"
        }, "ssh")).toEqual({
            valid: false,
            message: "Invalid VM ID format"
        });
    });

    it("rejects invalid ports", () => {
        expect(validateGuacamoleConnectionTarget({
            vm_id: "507f1f77bcf86cd799439011",
            port: 70000
        }, "rdp")).toEqual({
            valid: false,
            message: "RDP port must be an integer between 1 and 65535"
        });
    });

    it("normalizes safe Guacamole connection identifiers", () => {
        expect(validateGuacamoleConnectionId(" active:conn-1_2.3@example ")).toEqual({
            valid: true,
            connectionId: "active:conn-1_2.3@example"
        });
    });

    it("rejects unsafe Guacamole connection identifiers", () => {
        expect(validateGuacamoleConnectionId("")).toEqual({
            valid: false,
            message: "Connection ID is required"
        });
        expect(validateGuacamoleConnectionId("../connections/1")).toEqual({
            valid: false,
            message: "Invalid Connection ID format"
        });
        expect(validateGuacamoleConnectionId("abc?token=secret")).toEqual({
            valid: false,
            message: "Invalid Connection ID format"
        });
    });
});
