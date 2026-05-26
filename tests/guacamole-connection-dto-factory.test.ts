import { describe, expect, it } from "vitest";
import { buildEstablishedGuacamoleConnection } from "../src/modules/guacamole/GuacamoleConnectionDTOFactory";

describe("buildEstablishedGuacamoleConnection", () => {
    it("builds the shared Guacamole connection response shape", () => {
        const now = new Date("2026-05-26T01:00:00.000Z");

        expect(buildEstablishedGuacamoleConnection({
            protocol: "ssh",
            vmId: "507f1f77bcf86cd799439011",
            targetIp: "10.0.0.10",
            availableIps: ["10.0.0.10", "192.168.122.10"],
            directUrl: "https://guacamole.test/#/client/abc?token=token",
            guacamoleBaseUrl: "https://guacamole.test",
            guacamoleToken: "token",
            guacamoleDataSource: "postgresql",
            guacamoleConnectionId: "42",
            now
        })).toEqual({
            connection_id: "ssh-507f1f77bcf86cd799439011-1779757200000",
            protocol: "ssh",
            status: "active",
            created_at: now,
            expires_at: new Date("2026-05-26T05:00:00.000Z"),
            target_ip: "10.0.0.10",
            available_ips: ["10.0.0.10", "192.168.122.10"],
            direct_url: "https://guacamole.test/#/client/abc?token=token",
            guacamole_base_url: "https://guacamole.test",
            guacamole_token: "token",
            guacamole_data_source: "postgresql",
            guacamole_connection_id: "42"
        });
    });

    it("allows a custom TTL for tests and future shorter sessions", () => {
        const now = new Date("2026-05-26T01:00:00.000Z");

        const connection = buildEstablishedGuacamoleConnection({
            protocol: "vnc",
            vmId: "vm-1",
            directUrl: "url",
            guacamoleBaseUrl: "base",
            guacamoleToken: "token",
            guacamoleDataSource: "postgresql",
            guacamoleConnectionId: "99",
            now,
            ttlMs: 30_000
        });

        expect(connection.connection_id).toBe("vnc-vm-1-1779757200000");
        expect(connection.expires_at).toEqual(new Date("2026-05-26T01:00:30.000Z"));
    });
});
