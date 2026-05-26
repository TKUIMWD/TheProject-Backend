export function encodeGuacamoleConnectionId(configId: string, dataSource: string): string {
    const connectionIdentifier = `${configId}\0c\0${dataSource}`;
    return Buffer.from(connectionIdentifier).toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
}

export function buildGuacamoleDirectUrl(baseUrl: string, configId: string, dataSource: string, token: string): string {
    const encodedConnectionId = encodeGuacamoleConnectionId(configId, dataSource);
    return `${baseUrl}/#/client/${encodedConnectionId}?token=${encodeURIComponent(token)}`;
}

