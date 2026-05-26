import { describe, expect, it } from "vitest";
import { GuacamoleAuthService } from "../src/modules/guacamole/GuacamoleAuthService";

function makeService(options: {
    userLookup?: unknown;
    adminToken?: unknown;
    userToken?: unknown;
    createUser?: unknown;
    patchPermissions?: unknown;
    userPermissions?: unknown;
    createTokenThrows?: boolean;
    getUserThrows?: boolean;
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const api = {
        createToken: async (username: string, password: string) => {
            calls.push({ method: "createToken", args: [username, password] });
            if (options.createTokenThrows) throw new Error("token failed");
            if (username === "admin") return options.adminToken ?? { authToken: "admin-token", dataSource: "postgresql" };
            return options.userToken ?? { authToken: "user-token" };
        },
        getUser: async (dataSource: string, username: string, token: string) => {
            calls.push({ method: "getUser", args: [dataSource, username, token] });
            if (options.getUserThrows) throw new Error("lookup failed");
            return options.userLookup ?? { username };
        },
        createUser: async (dataSource: string, userData: Record<string, unknown>, token: string) => {
            calls.push({ method: "createUser", args: [dataSource, userData, token] });
            return options.createUser ?? { type: "SUCCESS" };
        },
        patchUserPermissions: async (dataSource: string, username: string, patchOperations: Record<string, unknown>[], token: string) => {
            calls.push({ method: "patchUserPermissions", args: [dataSource, username, patchOperations, token] });
            return options.patchPermissions ?? { type: "SUCCESS" };
        },
        getUserPermissions: async (dataSource: string, username: string, token: string) => {
            calls.push({ method: "getUserPermissions", args: [dataSource, username, token] });
            return options.userPermissions ?? { systemPermissions: ["CREATE_CONNECTION"] };
        }
    };

    return {
        calls,
        service: new GuacamoleAuthService(
            api,
            {
                apiUsername: "admin",
                apiPassword: "admin-pass",
                projectUserPassword: "user-pass"
            },
            (callback) => callback()
        )
    };
}

describe("GuacamoleAuthService", () => {
    it("gets admin auth tokens", async () => {
        const { service, calls } = makeService();

        await expect(service.getAdminAuthToken()).resolves.toMatchObject({
            code: 200,
            message: "Admin auth token obtained",
            body: {
                token: "admin-token",
                dataSource: "postgresql",
                username: "admin"
            }
        });

        expect(calls).toEqual([
            { method: "createToken", args: ["admin", "admin-pass"] }
        ]);
    });

    it("maps admin auth failures", async () => {
        const { service } = makeService({
            adminToken: { error: "invalid credentials" }
        });

        await expect(service.getAdminAuthToken()).resolves.toMatchObject({
            code: 500,
            message: "Admin authentication failed: invalid credentials"
        });
    });

    it("reuses existing Guacamole users and returns user tokens", async () => {
        const { service, calls } = makeService({
            userLookup: { username: "user@example.test" },
            userToken: { authToken: "user-token", dataSource: "postgresql" }
        });

        await expect(service.ensureUserAndGetToken("user@example.test")).resolves.toMatchObject({
            code: 200,
            message: "User auth token obtained",
            body: {
                token: "user-token",
                dataSource: "postgresql",
                username: "user@example.test"
            }
        });

        expect(calls).toEqual([
            { method: "createToken", args: ["admin", "admin-pass"] },
            { method: "getUser", args: ["postgresql", "user@example.test", "admin-token"] },
            { method: "createToken", args: ["user@example.test", "user-pass"] }
        ]);
    });

    it("creates missing users, sets permissions, verifies, and returns user tokens", async () => {
        const { service, calls } = makeService({
            userLookup: { type: "NOT_FOUND" }
        });

        await expect(service.ensureUserAndGetToken("user@example.test")).resolves.toMatchObject({
            code: 200,
            body: {
                token: "user-token"
            }
        });

        expect(calls).toEqual([
            { method: "createToken", args: ["admin", "admin-pass"] },
            { method: "getUser", args: ["postgresql", "user@example.test", "admin-token"] },
            {
                method: "createUser",
                args: [
                    "postgresql",
                    {
                        username: "user@example.test",
                        password: "user-pass",
                        attributes: {
                            "guac-full-name": "user@example.test",
                            "guac-email-address": "user@example.test"
                        }
                    },
                    "admin-token"
                ]
            },
            {
                method: "patchUserPermissions",
                args: [
                    "postgresql",
                    "user@example.test",
                    [{ op: "add", path: "/systemPermissions", value: "CREATE_CONNECTION" }],
                    "admin-token"
                ]
            },
            { method: "createToken", args: ["admin", "admin-pass"] },
            { method: "createToken", args: ["user@example.test", "user-pass"] },
            { method: "getUserPermissions", args: ["postgresql", "user@example.test", "admin-token"] }
        ]);
    });

    it("returns create-user failures", async () => {
        const { service } = makeService({
            userLookup: { type: "NOT_FOUND" },
            createUser: { type: "INTERNAL_ERROR", message: "database unavailable" }
        });

        await expect(service.ensureUserAndGetToken("user@example.test")).resolves.toMatchObject({
            code: 500,
            message: "Failed to create Guacamole user: database unavailable"
        });
    });

    it("treats user lookup errors as missing users", async () => {
        const { service, calls } = makeService({
            getUserThrows: true
        });

        await expect(service.ensureUserAndGetToken("user@example.test")).resolves.toMatchObject({
            code: 200,
            body: {
                token: "user-token"
            }
        });

        expect(calls.map((call) => call.method)).toEqual([
            "createToken",
            "getUser",
            "createUser",
            "patchUserPermissions",
            "createToken",
            "createToken",
            "getUserPermissions"
        ]);
    });

    it("reports failed user token responses", async () => {
        const { service } = makeService({
            userToken: {}
        });

        await expect(service.ensureUserAndGetToken("user@example.test")).resolves.toMatchObject({
            code: 500,
            message: "Failed to obtain user auth token"
        });
    });
});
