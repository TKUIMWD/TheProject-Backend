import { describe, expect, it } from "vitest";
import { GuacamoleConnectionManagementService } from "../src/modules/guacamole/GuacamoleConnectionManagementService";

function makeService(options: {
    listConnections?: unknown;
    listThrows?: boolean;
    connection?: unknown;
    getConnectionThrows?: boolean;
    deleteResponse?: unknown;
    deleteThrows?: boolean;
    adminToken?: any;
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const api = {
        listConnections: async (dataSource: string, token: string) => {
            calls.push({ method: "listConnections", args: [dataSource, token] });
            if (options.listThrows) throw new Error("list failed");
            return options.listConnections ?? {};
        },
        getConnection: async (dataSource: string, connectionId: string, token: string) => {
            calls.push({ method: "getConnection", args: [dataSource, connectionId, token] });
            if (options.getConnectionThrows) throw new Error("missing");
            return options.connection ?? { name: "SSH-lab-user@example.test" };
        },
        deleteConnection: async (dataSource: string, connectionId: string, token: string) => {
            calls.push({ method: "deleteConnection", args: [dataSource, connectionId, token] });
            if (options.deleteThrows) throw new Error("delete failed");
            return options.deleteResponse ?? {};
        }
    };
    const authProvider = {
        getAdminAuthToken: async () => {
            calls.push({ method: "getAdminAuthToken", args: [] });
            return options.adminToken ?? {
                code: 200,
                message: "ok",
                body: { token: "admin-token", dataSource: "postgresql" }
            };
        }
    };

    return {
        calls,
        service: new GuacamoleConnectionManagementService(api, authProvider)
    };
}

const user = {
    _id: "user-1",
    email: "user@example.test",
    username: "user"
} as any;

describe("GuacamoleConnectionManagementService", () => {
    it("lists current user's connections", async () => {
        const { service, calls } = makeService({
            listConnections: {
                "1": {
                    name: "SSH-lab-user@example.test",
                    protocol: "ssh",
                    parameters: {
                        hostname: "10.0.0.5",
                        port: "22",
                        username: "root"
                    }
                },
                "2": {
                    name: "SSH-lab-other@example.test"
                }
            }
        });

        await expect(service.listUserConnections({
            userEmail: "user@example.test",
            token: "user-token",
            dataSource: "postgresql"
        })).resolves.toMatchObject({
            code: 200,
            message: "Found 1 connections",
            body: [
                {
                    connection_id: "1",
                    name: "SSH-lab-user@example.test",
                    protocol: "ssh",
                    parameters: {
                        hostname: "10.0.0.5",
                        port: "22",
                        username: "root"
                    },
                    status: "active"
                }
            ]
        });

        expect(calls).toEqual([
            { method: "listConnections", args: ["postgresql", "user-token"] }
        ]);
    });

    it("maps invalid connection list payloads to empty lists", async () => {
        const { service } = makeService({ listConnections: "not-an-object" });

        await expect(service.listUserConnections({
            userEmail: "user@example.test",
            token: "user-token",
            dataSource: "postgresql"
        })).resolves.toEqual({
            code: 200,
            message: "No connections found",
            body: []
        });
    });

    it("maps list failures to stable errors", async () => {
        const { service } = makeService({ listThrows: true });

        await expect(service.listUserConnections({
            userEmail: "user@example.test",
            token: "user-token"
        })).resolves.toMatchObject({
            code: 500,
            message: "Failed to list connections from Guacamole: list failed"
        });
    });

    it("deletes owned connections", async () => {
        const { service, calls } = makeService({
            connection: { name: "SSH-lab-user@example.test" }
        });

        await expect(service.deleteConnection({
            connectionId: "conn-1",
            user,
            isSuperAdmin: false
        })).resolves.toMatchObject({
            code: 200,
            message: "Connection deleted successfully",
            body: {
                connection_id: "conn-1",
                name: "SSH-lab-user@example.test",
                deleted_by: "user@example.test"
            }
        });

        expect(calls).toEqual([
            { method: "getAdminAuthToken", args: [] },
            { method: "getConnection", args: ["postgresql", "conn-1", "admin-token"] },
            { method: "deleteConnection", args: ["postgresql", "conn-1", "admin-token"] }
        ]);
    });

    it("allows super admins to delete even when connection lookup fails", async () => {
        const { service, calls } = makeService({ getConnectionThrows: true });

        await expect(service.deleteConnection({
            connectionId: "conn-1",
            user,
            isSuperAdmin: true
        })).resolves.toMatchObject({
            code: 200,
            body: {
                connection_id: "conn-1",
                name: "connection-conn-1"
            }
        });

        expect(calls).toEqual([
            { method: "getAdminAuthToken", args: [] },
            { method: "getConnection", args: ["postgresql", "conn-1", "admin-token"] },
            { method: "deleteConnection", args: ["postgresql", "conn-1", "admin-token"] }
        ]);
    });

    it("rejects non-owner delete attempts", async () => {
        const { service } = makeService({
            connection: { name: "SSH-lab-other@example.test" }
        });

        await expect(service.deleteConnection({
            connectionId: "conn-1",
            user,
            isSuperAdmin: false
        })).resolves.toMatchObject({
            code: 403,
            message: "You don't have permission to delete this connection"
        });
    });

    it("maps delete API failures", async () => {
        const { service } = makeService({
            deleteResponse: { type: "NOT_FOUND" }
        });

        await expect(service.deleteConnection({
            connectionId: "conn-1",
            user,
            isSuperAdmin: false
        })).resolves.toMatchObject({
            code: 404,
            message: "Connection not found"
        });
    });

    it("maps admin auth failures", async () => {
        const { service } = makeService({
            adminToken: { code: 500, message: "bad auth" }
        });

        await expect(service.deleteConnection({
            connectionId: "conn-1",
            user,
            isSuperAdmin: false
        })).resolves.toMatchObject({
            code: 500,
            message: "Failed to authenticate with Guacamole service"
        });
    });
});
