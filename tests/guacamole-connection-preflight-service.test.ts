import { describe, expect, it } from "vitest";
import { GuacamoleConnectionPreflightService } from "../src/modules/guacamole/GuacamoleConnectionPreflightService";
import { createResponse } from "../src/utils/resp";

const vmId = "507f1f77bcf86cd799439041";
const userId = "507f1f77bcf86cd799439042";

function makeUser(overrides: Record<string, unknown> = {}) {
    return {
        _id: { toString: () => userId },
        username: "student",
        email: "student@example.test",
        ...overrides
    } as any;
}

function makeVM(overrides: Record<string, unknown> = {}) {
    return {
        _id: vmId,
        owner: userId,
        pve_node: "pve-a",
        pve_vmid: "101",
        ...overrides
    };
}

function makeService(options: {
    vm?: any;
    status?: string | null;
    interfaces?: any[];
    connected?: boolean;
    authCode?: number;
} = {}) {
    const calls: Array<{ target: string; method: string; args: unknown[] }> = [];
    const vm = Object.prototype.hasOwnProperty.call(options, "vm") ? options.vm : makeVM();
    const interfaces = options.interfaces ?? [
        {
            name: "eth0",
            "ip-addresses": [
                { "ip-address": "10.0.0.5", "ip-address-type": "ipv4" }
            ]
        }
    ];
    const vmRepository = {
        findById: async (id: string) => {
            calls.push({ target: "vmRepository", method: "findById", args: [id] });
            return vm;
        }
    };
    const vmUtils = {
        getVMStatus: async (...args: string[]) => {
            calls.push({ target: "vmUtils", method: "getVMStatus", args });
            return options.status === null ? null : { status: options.status ?? "running" };
        },
        getVMNetworkInfo: async (...args: string[]) => {
            calls.push({ target: "vmUtils", method: "getVMNetworkInfo", args });
            return { success: true, interfaces };
        },
        getVMConfig: async (...args: string[]) => {
            calls.push({ target: "vmUtils", method: "getVMConfig", args });
            return { name: "Ubuntu Lab" };
        }
    };
    const checkConnectivity = async (...args: [string, number, string]) => {
        calls.push({ target: "connectivity", method: "check", args });
        return options.connected === false
            ? { connected: false, message: "closed" }
            : { connected: true };
    };
    const getAuthToken = async () => {
        calls.push({ target: "auth", method: "getToken", args: [] });
        return options.authCode && options.authCode !== 200
            ? createResponse(options.authCode, "no auth")
            : createResponse(200, "ok", { token: "token-1", dataSource: "postgresql" } as any);
    };

    return {
        calls,
        service: new GuacamoleConnectionPreflightService({
            vmRepository,
            vmUtils,
            checkConnectivity,
            getAuthToken: getAuthToken as any
        })
    };
}

describe("GuacamoleConnectionPreflightService", () => {
    it("prepares VM, network, connectivity, display name, and auth context", async () => {
        const { service, calls } = makeService();

        const result = await service.prepare({
            req: {} as any,
            protocol: "ssh",
            user: makeUser(),
            isSuperAdmin: false,
            connectionTarget: { vmId, port: 22 }
        });

        expect(result).toMatchObject({
            vm: makeVM(),
            vmName: "Ubuntu Lab",
            networkInfo: {
                ip: "10.0.0.5",
                allIPs: ["10.0.0.5"]
            },
            authToken: { token: "token-1", dataSource: "postgresql" },
            dataSource: "postgresql"
        });
        expect(calls.map(call => `${call.target}.${call.method}`)).toEqual([
            "vmRepository.findById",
            "vmUtils.getVMStatus",
            "vmUtils.getVMNetworkInfo",
            "connectivity.check",
            "vmUtils.getVMConfig",
            "auth.getToken"
        ]);
    });

    it("rejects a VM owned by another user", async () => {
        const { service } = makeService({
            vm: makeVM({ owner: "someone-else" })
        });

        await expect(service.prepare({
            req: {} as any,
            protocol: "rdp",
            user: makeUser(),
            isSuperAdmin: false,
            connectionTarget: { vmId, port: 3389 }
        })).resolves.toMatchObject({
            error: {
                code: 403,
                message: "You don't have permission to access this VM"
            }
        });
    });

    it("returns a service-specific connectivity failure", async () => {
        const { service } = makeService({ connected: false });

        await expect(service.prepare({
            req: {} as any,
            protocol: "vnc",
            user: makeUser(),
            isSuperAdmin: true,
            connectionTarget: { vmId, port: 5901 },
            requestedIp: "10.0.0.5"
        })).resolves.toMatchObject({
            error: {
                code: 503,
                message: expect.stringContaining("VNC service")
            }
        });
    });
});
