import { ComputeResourcePlan } from "../../interfaces/ComputeResourcePlan";
import { sanitizeString } from "../../utils/sanitize";

const NUMERIC_FIELDS = [
    "max_cpu_cores_per_vm",
    "max_memory_per_vm",
    "max_storage_per_vm",
    "max_cpu_cores_sum",
    "max_memory_sum",
    "max_storage_sum",
    "max_vms"
] as const;

type NumericField = typeof NUMERIC_FIELDS[number];
type PlanInput = Partial<ComputeResourcePlan>;

export function validateComputeResourcePlanInput(
    payload: unknown,
    options: { partial?: boolean } = {}
): { valid: true; value: PlanInput } | { valid: false; message: string } {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return { valid: false, message: "CRP payload must be an object" };
    }

    const raw = payload as Record<string, unknown>;
    const value: PlanInput = {};

    if (raw.name !== undefined) {
        if (typeof raw.name !== "string") {
            return { valid: false, message: "name must be a string" };
        }
        const name = sanitizeString(raw.name).trim();
        if (!name) {
            return { valid: false, message: "name cannot be empty" };
        }
        value.name = name;
    } else if (!options.partial) {
        return { valid: false, message: "Missing required field 'name'" };
    }

    for (const field of NUMERIC_FIELDS) {
        const rawValue = raw[field];
        if (rawValue === undefined) {
            if (!options.partial) {
                return { valid: false, message: `Missing required field '${field}'` };
            }
            continue;
        }

        if (typeof rawValue !== "number" || !Number.isFinite(rawValue) || rawValue <= 0) {
            return { valid: false, message: `${field} must be a positive number` };
        }
        value[field] = rawValue;
    }

    if (options.partial && Object.keys(value).length === 0) {
        return { valid: false, message: "No valid CRP fields to update" };
    }

    if (!options.partial) {
        const complete = value as ComputeResourcePlan;
        const crossFieldError = validatePerVmDoesNotExceedTotal(complete);
        if (crossFieldError) {
            return { valid: false, message: crossFieldError };
        }
    }

    return { valid: true, value };
}

function validatePerVmDoesNotExceedTotal(plan: ComputeResourcePlan): string | null {
    const pairs: Array<[NumericField, NumericField, string]> = [
        ["max_cpu_cores_per_vm", "max_cpu_cores_sum", "max_cpu_cores_per_vm cannot exceed max_cpu_cores_sum"],
        ["max_memory_per_vm", "max_memory_sum", "max_memory_per_vm cannot exceed max_memory_sum"],
        ["max_storage_per_vm", "max_storage_sum", "max_storage_per_vm cannot exceed max_storage_sum"]
    ];

    for (const [perVmField, sumField, message] of pairs) {
        if (plan[perVmField] > plan[sumField]) {
            return message;
        }
    }

    return null;
}

