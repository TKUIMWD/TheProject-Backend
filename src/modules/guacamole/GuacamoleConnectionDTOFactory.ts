import { GuacamoleConnection } from "../../interfaces/Guacamole";
import { GuacamoleProtocol } from "./GuacamoleConnectionRequestPolicy";

const DEFAULT_CONNECTION_TTL_MS = 4 * 60 * 60 * 1000;

export function buildEstablishedGuacamoleConnection(input: {
    protocol: GuacamoleProtocol;
    vmId: string;
    targetIp?: string;
    availableIps?: string[];
    directUrl: string;
    guacamoleBaseUrl: string;
    guacamoleToken: string;
    guacamoleDataSource: string;
    guacamoleConnectionId: string;
    now?: Date;
    ttlMs?: number;
}): GuacamoleConnection {
    const now = input.now ?? new Date();
    const ttlMs = input.ttlMs ?? DEFAULT_CONNECTION_TTL_MS;

    return {
        connection_id: `${input.protocol}-${input.vmId}-${now.getTime()}`,
        protocol: input.protocol,
        status: "active",
        created_at: now,
        expires_at: new Date(now.getTime() + ttlMs),
        target_ip: input.targetIp,
        available_ips: input.availableIps,
        direct_url: input.directUrl,
        guacamole_base_url: input.guacamoleBaseUrl,
        guacamole_token: input.guacamoleToken,
        guacamole_data_source: input.guacamoleDataSource,
        guacamole_connection_id: input.guacamoleConnectionId
    };
}
