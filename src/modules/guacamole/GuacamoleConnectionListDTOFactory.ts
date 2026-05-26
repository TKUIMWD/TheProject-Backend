export type GuacamoleListedConnectionDTO = {
    connection_id: string;
    name: string;
    protocol: unknown;
    parameters: {
        hostname: unknown;
        port: unknown;
        username: unknown;
    };
    created_at: Date;
    status: "active";
};

export function buildUserGuacamoleConnectionListDTOs(
    connectionsResponse: unknown,
    userEmail: string,
    createdAt: Date = new Date()
): GuacamoleListedConnectionDTO[] {
    if (!connectionsResponse || typeof connectionsResponse !== "object") {
        return [];
    }

    const userConnections: GuacamoleListedConnectionDTO[] = [];
    for (const [connectionId, connection] of Object.entries(connectionsResponse as Record<string, unknown>)) {
        const connectionData = connection as any;
        if (!connectionData?.name || !connectionData.name.includes(userEmail)) {
            continue;
        }

        userConnections.push({
            connection_id: connectionId,
            name: connectionData.name,
            protocol: connectionData.protocol,
            parameters: {
                hostname: connectionData.parameters?.hostname,
                port: connectionData.parameters?.port,
                username: connectionData.parameters?.username
            },
            created_at: createdAt,
            status: "active"
        });
    }

    return userConnections;
}
