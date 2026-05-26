export function isCorsOriginAllowed(origin: string | undefined, allowedOrigins: readonly string[]): boolean {
    if (!origin) return true;
    if (allowedOrigins.includes("*")) return true;
    return allowedOrigins.includes(origin);
}

