import { describe, expect, it } from "vitest";
import { validateAssignableUserRole } from "../src/modules/super-admin/SuperAdminUserMutationPolicy";

describe("validateAssignableUserRole", () => {
    it("accepts user and admin roles", () => {
        expect(validateAssignableUserRole("user")).toEqual({ valid: true, role: "user" });
        expect(validateAssignableUserRole("admin")).toEqual({ valid: true, role: "admin" });
    });

    it("rejects missing, superadmin, and unknown roles", () => {
        const error = {
            valid: false,
            message: "Invalid or missing 'newRole' field. Can only be 'user' or 'admin'."
        };

        expect(validateAssignableUserRole(undefined)).toEqual(error);
        expect(validateAssignableUserRole("superadmin")).toEqual(error);
        expect(validateAssignableUserRole("owner")).toEqual(error);
    });
});
