import { validateObjectIdInput } from "../common/ObjectIdPolicy";

export function validateTokenUserId(value: unknown): { valid: true; userId: string } | { valid: false; message: string } {
    const result = validateObjectIdInput(value, "token user id");
    return result.valid
        ? { valid: true, userId: result.value }
        : { valid: false, message: "invalid token" };
}

