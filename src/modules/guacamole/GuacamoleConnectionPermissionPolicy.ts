export function canDeleteGuacamoleConnectionByName(
    userEmail: string,
    connectionName: unknown,
    isSuperAdmin: boolean
): { allowed: true } | { allowed: false; message: string } {
    if (isSuperAdmin) {
        return { allowed: true };
    }

    if (typeof connectionName !== "string" || connectionName.trim() === "") {
        return { allowed: false, message: "Connection not found or invalid" };
    }

    if (!connectionName.endsWith(`-${userEmail}`)) {
        return { allowed: false, message: "You don't have permission to delete this connection" };
    }

    return { allowed: true };
}
