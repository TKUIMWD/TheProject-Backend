import mongoose from "mongoose";

export function validateObjectIdInput(
    value: unknown,
    fieldName: string
): { valid: true; value: string } | { valid: false; message: string } {
    if (typeof value !== "string" || value.trim() === "") {
        return { valid: false, message: `${fieldName} is required` };
    }

    const normalized = value.trim();
    if (!mongoose.Types.ObjectId.isValid(normalized)) {
        return { valid: false, message: `Invalid ${fieldName} format` };
    }

    return { valid: true, value: normalized };
}

