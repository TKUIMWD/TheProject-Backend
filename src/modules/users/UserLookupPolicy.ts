import { validateObjectIdInput } from "../common/ObjectIdPolicy";

export function validateUserLookupId(value: unknown): { valid: true; userId: string } | { valid: false; message: string } {
    const result = validateObjectIdInput(value, "user_id");
    return result.valid
        ? { valid: true, userId: result.value }
        : { valid: false, message: "Invalid user_id format" };
}
