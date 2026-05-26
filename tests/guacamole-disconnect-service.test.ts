import { describe, expect, it } from "vitest";
import Roles from "../src/enum/role";
import { GuacamoleDisconnectService } from "../src/modules/guacamole/GuacamoleDisconnectService";

const userId = "507f1f77bcf86cd799439701";

function makeUser(overrides: Record<string, unknown> = {}) {
    return {
        _id: userId,
        username: "alice",
        email: "alice@example.test",
        role: Roles.User,
        password_hash: "",
        isVerified: true,
        compute_resource_plan_id: "",
        used_compute_resource_id: "",
        course_ids: [],
        owned_vms: [],
        owned_templates: [],
        ...overrides
    } as any;
}

function makeService(options: {
    configured?: boolean;
    authResp?: any;
    apiError?: Error;
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const service = new GuacamoleDisconnectService({
        isConfigured: () => options.configured ?? true,
        authProvider: {
            ensureUserAndGetToken: async (...args) => {
                calls.push({ method: "ensureUserAndGetToken", args });
                return options.authResp ?? {
                    code: 200,
                    message: "ok",
                    body: { token: "user-token", dataSource: "default" }
                };
            }
        },
        apiClient: {
            deleteActiveConnection: async (...args) => {
                calls.push({ method: "deleteActiveConnection", args });
                if (options.apiError) throw options.apiError;
                return {};
            }
        }
    });

    return { calls, service };
}

describe("GuacamoleDisconnectService", () => {
    it("returns service-unavailable when Guacamole is not configured", async () => {
        const { service, calls } = makeService({ configured: false });

        await expect(service.disconnect({
            user: makeUser(),
            body: { connection_id: "conn-1" }
        })).resolves.toEqual({
            code: 503,
            message: "Guacamole service is not configured. Please contact administrator to configure the service.",
            body: undefined
        });

        expect(calls).toEqual([]);
    });

    it("validates local connection IDs before auth or API calls", async () => {
        const { service, calls } = makeService();

        await expect(service.disconnect({
            user: makeUser(),
            body: { connection_id: "bad id" }
        })).resolves.toEqual({
            code: 400,
            message: "Invalid Connection ID format",
            body: undefined
        });

        expect(calls).toEqual([]);
    });

    it("returns success without Guacamole API calls when no active connection ID is provided", async () => {
        const { service, calls } = makeService();

        const result = await service.disconnect({
            user: makeUser(),
            body: { connection_id: "conn-1" }
        });

        expect(result).toMatchObject({
            code: 200,
            message: "Connection disconnected successfully",
            body: {
                message: "Connection closed successfully",
                connection_id: "conn-1"
            }
        });
        expect(result.body?.disconnected_at).toEqual(expect.any(String));
        expect(calls).toEqual([]);
    });

    it("validates active Guacamole connection IDs before auth", async () => {
        const { service, calls } = makeService();

        await expect(service.disconnect({
            user: makeUser(),
            body: {
                connection_id: "conn-1",
                guacamole_connection_id: "bad id"
            }
        })).resolves.toEqual({
            code: 400,
            message: "Invalid Guacamole connection ID format",
            body: undefined
        });

        expect(calls).toEqual([]);
    });

    it("authenticates the Guacamole user and kills active connections", async () => {
        const { service, calls } = makeService();

        await expect(service.disconnect({
            user: makeUser(),
            body: {
                connection_id: "conn-1",
                guacamole_connection_id: "active-1"
            }
        })).resolves.toMatchObject({
            code: 200,
            message: "Connection disconnected successfully"
        });

        expect(calls).toEqual([
            { method: "ensureUserAndGetToken", args: ["alice@example.test"] },
            { method: "deleteActiveConnection", args: ["default", "active-1", "user-token"] }
        ]);
    });

    it("returns auth failure when a Guacamole user token cannot be obtained", async () => {
        const { service, calls } = makeService({
            authResp: { code: 500, message: "token failed", body: undefined }
        });

        await expect(service.disconnect({
            user: makeUser(),
            body: {
                connection_id: "conn-1",
                guacamole_connection_id: "active-1"
            }
        })).resolves.toEqual({
            code: 500,
            message: "Failed to authenticate with Guacamole service for disconnect",
            body: undefined
        });

        expect(calls).toEqual([
            { method: "ensureUserAndGetToken", args: ["alice@example.test"] }
        ]);
    });

    it("returns Guacamole API disconnect failures", async () => {
        const { service } = makeService({ apiError: new Error("kill failed") });

        await expect(service.disconnect({
            user: makeUser(),
            body: {
                connection_id: "conn-1",
                guacamole_connection_id: "active-1"
            }
        })).resolves.toEqual({
            code: 500,
            message: "Failed to disconnect connection via Guacamole API",
            body: undefined
        });
    });
});
