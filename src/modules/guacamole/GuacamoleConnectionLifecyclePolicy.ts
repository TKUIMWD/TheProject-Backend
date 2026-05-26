export type GuacamoleCreateConnectionDecision =
    | { success: true; identifier: string }
    | { success: false; kind: "internal_error" | "not_found" | "missing_identifier"; message: string };

export type GuacamoleDeleteConnectionDecision =
    | { success: true }
    | { success: false; statusCode: 404 | 500; message: string };

export type GuacamoleDisconnectSuccessPayload = {
    message: string;
    connection_id: string;
    disconnected_at: string;
};

export type GuacamoleDeleteConnectionSuccessPayload = {
    connection_id: string;
    name: string;
    deleted_at: Date;
    deleted_by?: string;
};

export function findGuacamoleConnectionIdByName(
    connections: unknown,
    connectionName: string
): string | null {
    if (!connections || typeof connections !== "object") return null;

    for (const [id, connection] of Object.entries(connections as Record<string, unknown>)) {
        if ((connection as any)?.name === connectionName) {
            return id;
        }
    }

    return null;
}

export function classifyGuacamoleCreateConnectionResponse(response: unknown): GuacamoleCreateConnectionDecision {
    const payload = response as any;
    if (payload?.type === "INTERNAL_ERROR") {
        return {
            success: false,
            kind: "internal_error",
            message: payload.message || "Internal server error"
        };
    }

    if (payload?.type === "NOT_FOUND") {
        return {
            success: false,
            kind: "not_found",
            message: payload.message || "Resource not found"
        };
    }

    if (payload?.identifier) {
        return {
            success: true,
            identifier: String(payload.identifier)
        };
    }

    return {
        success: false,
        kind: "missing_identifier",
        message: "Connection creation response did not include an identifier"
    };
}

export function buildGuacamoleCreateConnectionFailureMessage(
    protocol: "ssh" | "rdp" | "vnc",
    decision: Exclude<GuacamoleCreateConnectionDecision, { success: true }>,
    context: { hostname?: string; port?: number } = {}
): string {
    if (protocol === "ssh") {
        if (decision.kind === "internal_error") {
            return `Guacamole internal error: ${decision.message}. Please check SSH service and credentials.`;
        }
        if (decision.kind === "not_found") {
            return `Guacamole configuration error: ${decision.message}`;
        }
        return "Failed to create connection configuration - missing identifier";
    }

    if (protocol === "rdp") {
        if (decision.kind === "internal_error" || decision.kind === "not_found") {
            return `Guacamole connection failed: ${decision.message || "Unknown error"}`;
        }
        return "Failed to create RDP connection configuration";
    }

    if (decision.kind === "internal_error") {
        return `Guacamole internal server error. Please check if VNC service is running on ${context.hostname}:${context.port}`;
    }
    if (decision.kind === "not_found") {
        return `Guacamole connection failed: ${decision.message || "Connection not found"}`;
    }
    return "Failed to create VNC connection configuration";
}

export function classifyGuacamoleDeleteConnectionResponse(response: unknown): GuacamoleDeleteConnectionDecision {
    const payload = response as any;
    if (payload?.type === "INTERNAL_ERROR") {
        return {
            success: false,
            statusCode: 500,
            message: `Guacamole internal error: ${payload.message || "Internal server error"}`
        };
    }

    if (payload?.type === "NOT_FOUND") {
        return {
            success: false,
            statusCode: 404,
            message: "Connection not found"
        };
    }

    if (payload?.error) {
        return {
            success: false,
            statusCode: 500,
            message: `Failed to delete connection: ${payload.error.message || "Unknown error"}`
        };
    }

    return { success: true };
}

export function buildGuacamoleDisconnectSuccessPayload(
    connectionId: string,
    disconnectedAt: Date | string = new Date()
): GuacamoleDisconnectSuccessPayload {
    const timestamp = disconnectedAt instanceof Date
        ? disconnectedAt.toISOString()
        : disconnectedAt;

    return {
        message: "Connection closed successfully",
        connection_id: connectionId,
        disconnected_at: timestamp
    };
}

export function buildGuacamoleDeleteConnectionSuccessPayload(input: {
    connectionId: string;
    connectionName: string;
    deletedBy?: string;
    deletedAt?: Date;
}): GuacamoleDeleteConnectionSuccessPayload {
    return {
        connection_id: input.connectionId,
        name: input.connectionName,
        deleted_at: input.deletedAt || new Date(),
        deleted_by: input.deletedBy
    };
}
