import Roles from "../../enum/role";

export type AssignableUserRole = Roles.User | Roles.Admin;

const ASSIGNABLE_ROLES = new Set<AssignableUserRole>([Roles.User, Roles.Admin]);

export function validateAssignableUserRole(value: unknown): { valid: true; role: AssignableUserRole } | { valid: false; message: string } {
    if (typeof value !== "string" || !ASSIGNABLE_ROLES.has(value as AssignableUserRole)) {
        return {
            valid: false,
            message: "Invalid or missing 'newRole' field. Can only be 'user' or 'admin'."
        };
    }

    return { valid: true, role: value as AssignableUserRole };
}
