import { GuacamoleProtocol } from "./GuacamoleConnectionRequestPolicy";

export const GUACAMOLE_SERVICE_NOT_CONFIGURED_MESSAGE = "Guacamole service is not configured. Please contact administrator to configure the service.";
export const GUACAMOLE_AUTHENTICATION_FAILURE_MESSAGE = "Failed to authenticate with Guacamole service";

export function buildGuacamoleConfigurationMissingLogMessage(protocol: GuacamoleProtocol): string {
    return `Guacamole service is not configured for ${protocol.toUpperCase()} connection`;
}

export function buildGuacamoleVMDisplayName(vmConfig: { name?: unknown } | null | undefined, pveVmid: unknown): string {
    return typeof vmConfig?.name === "string" && vmConfig.name.trim() !== ""
        ? vmConfig.name
        : `VM-${pveVmid}`;
}

export function buildGuacamoleServiceConnectivityFailureMessage(
    protocol: GuacamoleProtocol,
    hostname: string,
    port: number,
    reason?: string
): string {
    const protocolName = protocol.toUpperCase();
    if (protocol === "vnc") {
        return `${protocolName} service is not available on ${hostname}:${port}. ${reason || "Please ensure VNC server is running on the target VM."}`;
    }

    return `Cannot establish ${protocolName} connection: ${reason}. Please ensure ${protocolName} service is running on the target VM.`;
}
