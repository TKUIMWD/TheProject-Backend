import { describe, expect, it } from "vitest";
import Roles from "../src/enum/role";
import { GuacamoleRequestAdapterService } from "../src/modules/guacamole/GuacamoleRequestAdapterService";

const user = {
    _id: "507f1f77bcf86cd799439711",
    username: "alice",
    email: "alice@example.test",
    role: Roles.User,
    password_hash: "",
    isVerified: true,
    compute_resource_plan_id: "",
    used_compute_resource_id: "",
    course_ids: [],
    owned_vms: [],
    owned_templates: []
} as any;

function makeService(options: {
    configured?: boolean;
    authResp?: any;
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const service = new GuacamoleRequestAdapterService({
        isConfigured: () => options.configured ?? true,
        getAuthToken: async (...args) => {
            calls.push({ method: "getAuthToken", args });
            return options.authResp ?? {
                code: 200,
                message: "ok",
                body: { token: "user-token", dataSource: "postgresql" }
            };
        },
        connectionEstablishment: {
            establishSSHConnection: async (...args) => {
                calls.push({ method: "establishSSHConnection", args });
                return { code: 200, message: "ssh", body: undefined };
            },
            establishRDPConnection: async (...args) => {
                calls.push({ method: "establishRDPConnection", args });
                return { code: 200, message: "rdp", body: undefined };
            },
            establishVNCConnection: async (...args) => {
                calls.push({ method: "establishVNCConnection", args });
                return { code: 200, message: "vnc", body: undefined };
            }
        },
        disconnect: {
            disconnect: async (...args) => {
                calls.push({ method: "disconnect", args });
                return { code: 200, message: "Connection disconnected successfully", body: { message: "closed" } };
            }
        },
        connectionManagement: {
            listUserConnections: async (...args) => {
                calls.push({ method: "listUserConnections", args });
                return { code: 200, message: "Found 0 connections", body: [] };
            },
            deleteConnection: async (...args) => {
                calls.push({ method: "deleteConnection", args });
                return { code: 200, message: "Connection deleted successfully", body: undefined };
            }
        }
    });

    return { calls, service };
}

describe("GuacamoleRequestAdapterService", () => {
    it("maps SSH/RDP/VNC route bodies to establishment workflows", async () => {
        const { calls, service } = makeService();
        const body = { vm_id: "vm-1", port: 22 };

        await service.establishSSHConnection({ user, isSuperAdmin: false, body });
        await service.establishRDPConnection({ user, isSuperAdmin: true, body });
        await service.establishVNCConnection({ user, isSuperAdmin: false, body });

        expect(calls).toEqual([
            { method: "establishSSHConnection", args: [{ request: body, user, isSuperAdmin: false }] },
            { method: "establishRDPConnection", args: [{ request: body, user, isSuperAdmin: true }] },
            { method: "establishVNCConnection", args: [{ request: body, user, isSuperAdmin: false }] }
        ]);
    });

    it("maps disconnect bodies to the disconnect workflow", async () => {
        const { calls, service } = makeService();
        const body = { connection_id: "conn-1", guacamole_connection_id: "active-1" };

        await expect(service.disconnectGuacamoleConnection({ user, isSuperAdmin: false, body })).resolves.toMatchObject({
            code: 200,
            message: "Connection disconnected successfully"
        });

        expect(calls).toEqual([
            { method: "disconnect", args: [{ user, body }] }
        ]);
    });

    it("lists user connections with a user token and data source", async () => {
        const { calls, service } = makeService();

        await expect(service.listUserConnections({ user })).resolves.toEqual({
            code: 200,
            message: "Found 0 connections",
            body: []
        });

        expect(calls).toEqual([
            { method: "getAuthToken", args: [user] },
            {
                method: "listUserConnections",
                args: [{
                    userEmail: "alice@example.test",
                    token: "user-token",
                    dataSource: "postgresql"
                }]
            }
        ]);
    });

    it("returns service-unavailable for connection lists when Guacamole is not configured", async () => {
        const { calls, service } = makeService({ configured: false });

        await expect(service.listUserConnections({ user })).resolves.toEqual({
            code: 503,
            message: "Guacamole service is not configured. Please contact administrator to configure the service.",
            body: undefined
        });

        expect(calls).toEqual([]);
    });

    it("validates delete connection IDs before management calls", async () => {
        const { calls, service } = makeService();

        await expect(service.deleteConnection({
            user,
            isSuperAdmin: false,
            body: { connection_id: "bad id" }
        })).resolves.toEqual({
            code: 400,
            message: "Invalid Connection ID format",
            body: undefined
        });

        expect(calls).toEqual([]);
    });

    it("delegates valid delete requests with actor context", async () => {
        const { calls, service } = makeService();

        await expect(service.deleteConnection({
            user,
            isSuperAdmin: true,
            body: { connection_id: "conn-1" }
        })).resolves.toMatchObject({
            code: 200,
            message: "Connection deleted successfully"
        });

        expect(calls).toEqual([
            {
                method: "deleteConnection",
                args: [{
                    connectionId: "conn-1",
                    user,
                    isSuperAdmin: true
                }]
            }
        ]);
    });
});
