export type PaginationInput = {
    page?: unknown;
    limit?: unknown;
};

export type PaginationPolicyOptions = {
    defaultPage?: number;
    defaultLimit?: number;
    maxLimit?: number;
};

export function validatePaginationInput(
    input: PaginationInput,
    options: PaginationPolicyOptions = {}
): { valid: true; page: number; limit: number; skip: number } | { valid: false; message: string } {
    const defaultPage = options.defaultPage ?? 1;
    const defaultLimit = options.defaultLimit ?? 10;
    const maxLimit = options.maxLimit ?? 100;

    const page = parsePositiveInteger(input.page, defaultPage);
    if (!page.valid) return { valid: false, message: "page must be a positive integer" };

    const limit = parsePositiveInteger(input.limit, defaultLimit);
    if (!limit.valid) return { valid: false, message: "limit must be a positive integer" };

    if (limit.value > maxLimit) {
        return { valid: false, message: `limit must be less than or equal to ${maxLimit}` };
    }

    return {
        valid: true,
        page: page.value,
        limit: limit.value,
        skip: (page.value - 1) * limit.value
    };
}

function parsePositiveInteger(value: unknown, fallback: number): { valid: true; value: number } | { valid: false } {
    if (value === undefined || value === null || value === "") {
        return { valid: true, value: fallback };
    }

    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        return { valid: false };
    }

    return { valid: true, value: parsed };
}

