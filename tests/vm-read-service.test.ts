import { describe, expect, it } from "vitest";
import Roles from "../src/enum/role";
import { VMReadService } from "../src/modules/vm/VMReadService";

const userId = "507f1f77bcf86cd799439401";
const otherUserId = "507f1f77bcf86cd799439402";
const vmId = "507f1f77bcf86cd799439403";

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
        owned_vms: [vmId],
        owned_templates: [],
        ...overrides
    } as any;
}

function makeVM(overrides: Record<string, unknown> = {}) {
    return {
        _id: vmId,
        pve_node: "pve-a",
        pve_vmid: "101",
        owner: userId,
        ...overrides
    };
}

function makeService(options: {
    vmsByIds?: any[];
    allVMs?: any[];
    vm?: any | null;
    users?: any[];
    basicConfig?: any;
    basicConfigError?: Error;
    status?: any;
    resourceUsage?: any;
    resourceUsageError?: Error;
    networkInfo?: any;
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const service = new VMReadService({
        vmRepo: {
            listByIds: async (...args) => {
                calls.push({ method: "listVMsByIds", args });
                return options.vmsByIds ?? [makeVM()];
            },
            listAll: async (...args) => {
                calls.push({ method: "listAllVMs", args });
                return options.allVMs ?? [makeVM()];
            },
            findById: async (...args) => {
                calls.push({ method: "findVMById", args });
                return options.vm === undefined ? makeVM() : options.vm;
            }
        },
        userRepo: {
            listByIds: async (...args) => {
                calls.push({ method: "listUsersByIds", args });
                return options.users ?? [{ _id: userId, username: "alice" }];
            }
        },
        vmUtils: {
            getBasicQemuConfig: async (...args) => {
                calls.push({ method: "getBasicQemuConfig", args });
                if (options.basicConfigError) throw options.basicConfigError;
                return options.basicConfig ?? {
                    code: 200,
                    message: "ok",
                    body: {
                        vmid: 101,
                        name: "ubuntu-lab",
                        cores: 2,
                        memory: "2048",
                        node: "pve-a",
                        status: "running",
                        disk_size: 20
                    }
                };
            },
            getVMStatus: async (...args) => {
                calls.push({ method: "getVMStatus", args });
                return options.status ?? { status: "running", uptime: 60 };
            },
            getVMResourceUsage: async (...args) => {
                calls.push({ method: "getVMResourceUsage", args });
                if (options.resourceUsageError) throw options.resourceUsageError;
                return options.resourceUsage ?? { success: true, cpu: 12.5, memory: 1.5 };
            },
            getVMNetworkInfo: async (...args) => {
                calls.push({ method: "getVMNetworkInfo", args });
                return options.networkInfo ?? {
                    success: true,
                    interfaces: [
                        {
                            name: "eth0",
                            "hardware-address": "aa:bb:cc",
                            "ip-addresses": [
                                { "ip-address": "127.0.0.1", "ip-address-type": "ipv4" },
                                { "ip-address": "10.0.0.5", "ip-address-type": "ipv4" },
                                { "ip-address": "fe80::1", "ip-address-type": "ipv6" }
                            ]
                        },
                        {
                            name: "lo",
                            "hardware-address": "00:00",
                            "ip-addresses": []
                        }
                    ]
                };
            }
        }
    });

    return { calls, service };
}

describe("VMReadService", () => {
    it("returns an empty response when the user owns no VMs", async () => {
        const { service, calls } = makeService();

        await expect(service.listUserOwnedVMs(makeUser({ owned_vms: [] }))).resolves.toEqual({
            code: 200,
            message: "No VMs found for user",
            body: []
        });

        expect(calls).toEqual([]);
    });

    it("lists user-owned VMs with status DTOs", async () => {
        const { service, calls } = makeService();

        await expect(service.listUserOwnedVMs(makeUser())).resolves.toMatchObject({
            code: 200,
            message: "User VMs fetched successfully",
            body: [
                {
                    _id: vmId,
                    pve_vmid: "101",
                    pve_node: "pve-a",
                    status: {
                        current_status: "running",
                        uptime: 60
                    },
                    error: null
                }
            ]
        });

        expect(calls).toContainEqual({ method: "listVMsByIds", args: [[vmId]] });
    });

    it("lists all VMs with batched owner names and PVE names", async () => {
        const { service, calls } = makeService({
            allVMs: [makeVM(), makeVM({ _id: "vm-2", owner: otherUserId, pve_vmid: "102" })],
            users: [
                { _id: userId, username: "alice" },
                { _id: otherUserId, username: "bob" }
            ]
        });

        await expect(service.listAllVMs()).resolves.toMatchObject({
            code: 200,
            message: "All VMs fetched successfully",
            body: [
                {
                    owner: "alice",
                    pve_name: "ubuntu-lab"
                },
                {
                    owner: "bob",
                    pve_name: "ubuntu-lab"
                }
            ]
        });

        expect(calls).toContainEqual({ method: "listUsersByIds", args: [[userId, otherUserId]] });
    });

    it("uses list error DTOs when VM config/status loading throws", async () => {
        const { service } = makeService({
            basicConfigError: new Error("PVE unavailable")
        });

        await expect(service.listUserOwnedVMs(makeUser())).resolves.toMatchObject({
            code: 200,
            body: [
                {
                    _id: vmId,
                    owner: userId,
                    config: null,
                    status: null,
                    error: "Failed to fetch VM config or status"
                }
            ]
        });
    });

    it("returns VM status with resource usage for running VMs", async () => {
        const { service, calls } = makeService();

        await expect(service.getVMStatus({
            user: makeUser(),
            isSuperAdmin: false,
            vmId
        })).resolves.toEqual({
            code: 200,
            message: "VM status retrieved successfully",
            body: {
                status: "running",
                uptime: 60,
                resourceUsage: {
                    cpu: 12.5,
                    memory: 1.5
                }
            }
        });

        expect(calls.map((call) => call.method)).toContain("getVMResourceUsage");
    });

    it("blocks VM status reads from non-owners", async () => {
        const { service, calls } = makeService();

        await expect(service.getVMStatus({
            user: makeUser({ _id: otherUserId }),
            isSuperAdmin: false,
            vmId
        })).resolves.toMatchObject({
            code: 403,
            message: "You don't have permission to access this VM"
        });

        expect(calls.map((call) => call.method)).not.toContain("getVMStatus");
    });

    it("returns network interfaces only for running VMs", async () => {
        const { service } = makeService();

        await expect(service.getVMNetworkInfo({
            user: makeUser(),
            isSuperAdmin: false,
            vmId
        })).resolves.toEqual({
            code: 200,
            message: "VM network information retrieved successfully",
            body: {
                interfaces: [
                    {
                        name: "eth0",
                        macAddress: "aa:bb:cc",
                        ipAddresses: ["10.0.0.5"]
                    }
                ]
            }
        });
    });

    it("rejects network info for stopped VMs before network lookup", async () => {
        const { service, calls } = makeService({
            status: { status: "stopped" }
        });

        await expect(service.getVMNetworkInfo({
            user: makeUser(),
            isSuperAdmin: false,
            vmId
        })).resolves.toMatchObject({
            code: 400,
            message: "VM must be running to get network information"
        });

        expect(calls.map((call) => call.method)).not.toContain("getVMNetworkInfo");
    });
});
