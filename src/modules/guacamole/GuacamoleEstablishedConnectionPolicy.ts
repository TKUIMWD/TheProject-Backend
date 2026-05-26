import { GuacamoleProtocol } from "./GuacamoleConnectionRequestPolicy";

export function buildGuacamoleDirectSessionLogMessage(protocol: GuacamoleProtocol, configId: string): string {
    return `Generated ${protocol.toUpperCase()} direct session URL for config ${configId}`;
}

export function buildGuacamoleConnectionEstablishedMessage(protocol: GuacamoleProtocol): string {
    return `${protocol.toUpperCase()} connection established`;
}

export function buildGuacamoleConnectionEstablishedLogMessage(input: {
    protocol: GuacamoleProtocol;
    username?: string;
    vmId: string;
    pveVmid: string;
    ip: string;
}): string {
    return `${input.protocol.toUpperCase()} connection established for user ${input.username} to VM ${input.vmId} (${input.pveVmid}) at ${input.ip}`;
}

export function buildGuacamoleConnectionEstablishFailureMessage(protocol: GuacamoleProtocol, error: unknown): string {
    const message = error instanceof Error ? error.message : "Unknown error";
    return `Failed to establish ${protocol.toUpperCase()} connection with Guacamole: ${message}`;
}
