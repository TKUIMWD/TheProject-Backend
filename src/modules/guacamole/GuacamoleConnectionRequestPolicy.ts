import { validateObjectIdInput } from "../common/ObjectIdPolicy";

export type GuacamoleProtocol = "ssh" | "rdp" | "vnc";

const DEFAULT_PORTS: Record<GuacamoleProtocol, number> = {
    ssh: 22,
    rdp: 3389,
    vnc: 5900
};

const CONNECTION_ID_PATTERN = /^[A-Za-z0-9._:@-]+$/;

export function validateGuacamoleConnectionTarget(
    value: { vm_id?: unknown; port?: unknown },
    protocol: GuacamoleProtocol
): { valid: true; vmId: string; port: number } | { valid: false; message: string } {
    const vmIdResult = validateObjectIdInput(value.vm_id, "VM ID");
    if (!vmIdResult.valid) {
        return vmIdResult;
    }

    const portValue = value.port ?? DEFAULT_PORTS[protocol];
    const port = typeof portValue === "number" ? portValue : Number(portValue);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return { valid: false, message: `${protocol.toUpperCase()} port must be an integer between 1 and 65535` };
    }

    return {
        valid: true,
        vmId: vmIdResult.value,
        port
    };
}

export function validateGuacamoleConnectionId(
    value: unknown,
    fieldName: string = "Connection ID"
): { valid: true; connectionId: string } | { valid: false; message: string } {
    if (typeof value !== "string" || value.trim() === "") {
        return { valid: false, message: `${fieldName} is required` };
    }

    const connectionId = value.trim();
    if (connectionId.length > 256 || !CONNECTION_ID_PATTERN.test(connectionId)) {
        return { valid: false, message: `Invalid ${fieldName} format` };
    }

    return { valid: true, connectionId };
}
