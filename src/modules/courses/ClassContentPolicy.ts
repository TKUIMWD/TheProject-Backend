import { sanitizeString } from "../../utils/sanitize";

export interface ClassContentFields {
    class_name: string;
    class_subtitle: string;
    class_order: number;
}

export type ClassContentUpdate = Partial<ClassContentFields>;

export function validateClassCreateInput(value: Partial<Record<keyof ClassContentFields, unknown>>): { valid: true; fields: ClassContentFields } | { valid: false; message: string } {
    const requiredFields: Array<keyof ClassContentFields> = ["class_name", "class_subtitle", "class_order"];
    const missingFields = requiredFields.filter((field) => value[field] === undefined);
    if (missingFields.length > 0) {
        return { valid: false, message: `Missing required fields: ${missingFields.join(', ')}` };
    }

    const fields = validateClassContentFields(value);
    if (!fields.valid) {
        return fields;
    }

    return { valid: true, fields: fields.fields as ClassContentFields };
}

export function validateClassUpdateInput(value: Partial<Record<keyof ClassContentFields, unknown>>): { valid: true; updates: ClassContentUpdate } | { valid: false; message: string } {
    const fields = validateClassContentFields(value);
    if (!fields.valid) {
        return fields;
    }

    if (Object.keys(fields.fields).length === 0) {
        return { valid: false, message: "No valid fields to update" };
    }

    return { valid: true, updates: fields.fields };
}

function validateClassContentFields(value: Partial<Record<keyof ClassContentFields, unknown>>): { valid: true; fields: ClassContentUpdate } | { valid: false; message: string } {
    const fields: ClassContentUpdate = {};

    if (value.class_name !== undefined) {
        const className = sanitizeString(asString(value.class_name));
        if (className.trim() === '') {
            return { valid: false, message: "class_name cannot be empty or strings containing security-sensitive characters" };
        }
        fields.class_name = className;
    }

    if (value.class_subtitle !== undefined) {
        const classSubtitle = sanitizeString(asString(value.class_subtitle));
        if (classSubtitle.trim() === '') {
            return { valid: false, message: "class_subtitle cannot be empty or strings containing security-sensitive characters" };
        }
        fields.class_subtitle = classSubtitle;
    }

    if (value.class_order !== undefined) {
        if (typeof value.class_order !== "number" || value.class_order < 0) {
            return { valid: false, message: "class_order must be a non-negative number" };
        }
        fields.class_order = value.class_order;
    }

    return { valid: true, fields };
}

function asString(value: unknown): string {
    return typeof value === "string" ? value : "";
}
