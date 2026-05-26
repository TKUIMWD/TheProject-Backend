import { describe, expect, it } from "vitest";
import { GuacamoleConnectionConfigService } from "../src/modules/guacamole/GuacamoleConnectionConfigService";

function makeInput() {
    return {
        protocol: "ssh" as const,
        dataSource: "postgresql",
        token: "token-1",
        connectionName: "SSH-Lab-user@example.test",
        connectionConfig: { name: "SSH-Lab-user@example.test" },
        hostname: "10.0.0.5",
        port: 22
    };
}

function makeService(options: {
    listResponse?: unknown;
    listThrows?: boolean;
    createResponse?: unknown;
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const api = {
        listConnections: async (dataSource: string, token: string) => {
            calls.push({ method: "listConnections", args: [dataSource, token] });
            if (options.listThrows) throw new Error("list failed");
            return options.listResponse ?? {};
        },
        createConnection: async (dataSource: string, config: Record<string, unknown>, token: string) => {
            calls.push({ method: "createConnection", args: [dataSource, config, token] });
            return options.createResponse ?? { identifier: "new-config-1" };
        }
    };

    return {
        calls,
        service: new GuacamoleConnectionConfigService(api)
    };
}

describe("GuacamoleConnectionConfigService", () => {
    it("reuses existing connection configs by connection name", async () => {
        const input = makeInput();
        const { service, calls } = makeService({
            listResponse: {
                "existing-config-1": { name: input.connectionName }
            }
        });

        await expect(service.getOrCreateConnectionConfig(input)).resolves.toMatchObject({
            code: 200,
            message: "Guacamole connection config ready",
            body: "existing-config-1"
        });

        expect(calls).toEqual([
            { method: "listConnections", args: ["postgresql", "token-1"] }
        ]);
    });

    it("creates a connection config when no matching config exists", async () => {
        const input = makeInput();
        const { service, calls } = makeService({
            listResponse: {
                other: { name: "Other" }
            },
            createResponse: { identifier: 123 }
        });

        await expect(service.getOrCreateConnectionConfig(input)).resolves.toMatchObject({
            code: 200,
            message: "Guacamole connection config ready",
            body: "123"
        });

        expect(calls).toEqual([
            { method: "listConnections", args: ["postgresql", "token-1"] },
            { method: "createConnection", args: ["postgresql", input.connectionConfig, "token-1"] }
        ]);
    });

    it("continues with creation when listing existing configs fails", async () => {
        const input = makeInput();
        const { service, calls } = makeService({
            listThrows: true,
            createResponse: { identifier: "new-config-1" }
        });

        await expect(service.getOrCreateConnectionConfig(input)).resolves.toMatchObject({
            code: 200,
            body: "new-config-1"
        });

        expect(calls).toEqual([
            { method: "listConnections", args: ["postgresql", "token-1"] },
            { method: "createConnection", args: ["postgresql", input.connectionConfig, "token-1"] }
        ]);
    });

    it("returns protocol-specific creation failures", async () => {
        const input = { ...makeInput(), protocol: "vnc" as const, port: 5901 };
        const { service } = makeService({
            createResponse: {
                type: "INTERNAL_ERROR",
                message: "backend unavailable"
            }
        });

        await expect(service.getOrCreateConnectionConfig(input)).resolves.toMatchObject({
            code: 500,
            message: "Guacamole internal server error. Please check if VNC service is running on 10.0.0.5:5901"
        });
    });
});
