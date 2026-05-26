export type GuacamoleUserMutationDecision =
    | { success: true; message: string }
    | { success: false; message: string };

export type GuacamoleUserLookupDecision =
    | { exists: true; user: unknown }
    | { exists: false };

export function classifyGuacamoleUserLookupResponse(response: unknown): GuacamoleUserLookupDecision {
    const payload = response as any;
    if (payload && (payload.type === "NOT_FOUND" || payload.error)) {
        return { exists: false };
    }

    return {
        exists: true,
        user: response
    };
}

export function buildGuacamoleUserCreatePayload(userEmail: string, password: string): Record<string, unknown> {
    return {
        username: userEmail,
        password,
        attributes: {
            "guac-full-name": userEmail,
            "guac-email-address": userEmail
        }
    };
}

export function classifyGuacamoleUserMutationResponse(
    response: unknown,
    successMessage: string
): GuacamoleUserMutationDecision {
    const payload = response as any;
    if (payload?.type && payload.type !== "SUCCESS") {
        return {
            success: false,
            message: payload.message || payload.type
        };
    }

    return {
        success: true,
        message: successMessage
    };
}

export function buildCreateConnectionPermissionPatchOperations(): Record<string, unknown>[] {
    return [
        {
            op: "add",
            path: "/systemPermissions",
            value: "CREATE_CONNECTION"
        }
    ];
}

export function evaluateCreateConnectionPermission(permissions: unknown): {
    hasPermissions: boolean;
    message: string;
} {
    const systemPermissions = (permissions as any)?.systemPermissions;
    const hasPermissions = Array.isArray(systemPermissions) && systemPermissions.includes("CREATE_CONNECTION");

    return {
        hasPermissions,
        message: hasPermissions
            ? "User has connection creation permissions"
            : "User missing CREATE_CONNECTION permission"
    };
}
