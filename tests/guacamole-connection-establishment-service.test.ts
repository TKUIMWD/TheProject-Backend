import { describe, expect, it } from "vitest";
import { GuacamoleConnectionEstablishmentService } from "../src/modules/guacamole/GuacamoleConnectionEstablishmentService";

const vmId = "507f1f77bcf86cd7994390f1";
const user = {
    _id: "507f1f77bcf86cd7994390f2",
    username: "student",
    email: "student@example.com"
} as any;

function makeInput(body: Record<string, unknown>) {
    return {
        request: body,
        user,
        isSuperAdmin: false
    } as any;
}

function makeService(options: {
    configured?: boolean;
    preflightError?: any;
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const service = new GuacamoleConnectionEstablishmentService({
        guacamoleBaseUrl: "https://guac.example.test",
        isConfigured: () => options.configured ?? true,
        getAuthToken: async () => ({ code: 200, message: "ok", body: { token: "token-1", dataSource: "postgresql" } } as any),
        nowMs: () => 1_779_724_800_000,
        directUrlBuilder: (baseUrl, configId, dataSource, token) => {
            calls.push({ method: "directUrlBuilder", args: [baseUrl, configId, dataSource, token] });
            return `${baseUrl}/#/client/${configId}?token=${token}&ds=${dataSource}`;
        },
        preparePreflight: async (input) => {
            calls.push({
                method: "preparePreflight",
                args: [input.protocol, input.connectionTarget, input.requestedIp]
            });
            if (options.preflightError) return { error: options.preflightError };
            return {
                vm: { pve_vmid: "101" },
                vmName: "web-lab",
                networkInfo: { ip: "10.0.0.5", allIPs: ["10.0.0.5"] },
                authToken: { token: "token-1", dataSource: "postgresql" },
                dataSource: "postgresql"
            };
        },
        configService: {
            getOrCreateConnectionConfig: async (input) => {
                calls.push({ method: "getOrCreateConnectionConfig", args: [input] });
                return { code: 200, message: "ok", body: "config-1" };
            }
        }
    });

    return { calls, service };
}

describe("GuacamoleConnectionEstablishmentService", () => {
    it("establishes SSH connections through preflight and config lifecycle", async () => {
        const { service, calls } = makeService();

        await expect(service.establishSSHConnection(makeInput({
            vm_id: vmId,
            username: "root",
            password: "secret",
            port: "22",
            font_size: 18,
            ip_address: "10.0.0.5"
        }))).resolves.toMatchObject({
            code: 200,
            message: "SSH connection established",
            body: {
                protocol: "ssh",
                target_ip: "10.0.0.5",
                guacamole_connection_id: "config-1"
            }
        });

        expect(calls.map((call) => call.method)).toEqual([
            "preparePreflight",
            "getOrCreateConnectionConfig",
            "directUrlBuilder"
        ]);
        expect((calls[1].args[0] as any)).toMatchObject({
            protocol: "ssh",
            hostname: "10.0.0.5",
            port: 22
        });
    });

    it("rejects RDP requests without credentials before preflight", async () => {
        const { service, calls } = makeService();

        await expect(service.establishRDPConnection(makeInput({
            vm_id: vmId,
            port: 3389
        }))).resolves.toMatchObject({
            code: 400,
            message: "Username and password are required for RDP connection"
        });
        expect(calls).toEqual([]);
    });

    it("returns configuration errors before authentication", async () => {
        const { service, calls } = makeService({ configured: false });

        await expect(service.establishVNCConnection(makeInput({
            vm_id: vmId,
            password: "secret"
        }))).resolves.toMatchObject({
            code: 503,
            message: "Guacamole service is not configured. Please contact administrator to configure the service."
        });
        expect(calls).toEqual([]);
    });

    it("propagates preflight failures", async () => {
        const { service, calls } = makeService({
            preflightError: { code: 400, message: "VM is not running" }
        });

        await expect(service.establishVNCConnection(makeInput({
            vm_id: vmId,
            password: "secret"
        }))).resolves.toMatchObject({
            code: 400,
            message: "VM is not running"
        });
        expect(calls.some((call) => call.method === "getOrCreateConnectionConfig")).toBe(false);
    });
});
