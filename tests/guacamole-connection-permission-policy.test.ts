import { describe, expect, it } from "vitest";
import { canDeleteGuacamoleConnectionByName } from "../src/modules/guacamole/GuacamoleConnectionPermissionPolicy";

describe("canDeleteGuacamoleConnectionByName", () => {
    it("allows super admins without checking connection names", () => {
        expect(canDeleteGuacamoleConnectionByName("admin@example.com", undefined, true)).toEqual({ allowed: true });
    });

    it("allows owners when the connection name ends with their email", () => {
        expect(canDeleteGuacamoleConnectionByName(
            "student@example.com",
            "ssh-training-vm-student@example.com",
            false
        )).toEqual({ allowed: true });
    });

    it("rejects non-owner connection names", () => {
        expect(canDeleteGuacamoleConnectionByName(
            "student@example.com",
            "ssh-training-vm-other@example.com",
            false
        )).toEqual({
            allowed: false,
            message: "You don't have permission to delete this connection"
        });
    });

    it("rejects missing or invalid connection names", () => {
        expect(canDeleteGuacamoleConnectionByName("student@example.com", "", false)).toEqual({
            allowed: false,
            message: "Connection not found or invalid"
        });
        expect(canDeleteGuacamoleConnectionByName("student@example.com", undefined, false)).toEqual({
            allowed: false,
            message: "Connection not found or invalid"
        });
    });
});
