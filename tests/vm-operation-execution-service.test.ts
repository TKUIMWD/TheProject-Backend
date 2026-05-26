import { describe, expect, it } from "vitest";
import { VMOperationExecutionService } from "../src/modules/vm/VMOperationExecutionService";

const user = {
    _id: { toString: () => "user-1" },
    username: "alice"
} as any;

const vm = {
    owner: "user-1",
    pve_node: "pve-a",
    pve_vmid: "101"
};

function makeService(options: {
    vm?: any | null;
    status?: any;
    operationResult?: any;
    waitResult?: any;
    normalize?: boolean;
    identityResult?: any;
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const service = new VMOperationExecutionService({
        vmRepository: {
            findById: async (vmId: string) => {
                calls.push({ method: "findById", args: [vmId] });
                return options.vm === undefined ? vm : options.vm;
            }
        },
        vmUtils: {
            getVMStatus: async (node: string, vmid: string) => {
                calls.push({ method: "getVMStatus", args: [node, vmid] });
                return options.status ?? { status: "stopped" };
            },
            startVM: async (node: string, vmid: string) => {
                calls.push({ method: "startVM", args: [node, vmid] });
                return options.operationResult ?? { success: true, upid: "UPID:start" };
            },
            shutdownVM: async (node: string, vmid: string) => {
                calls.push({ method: "shutdownVM", args: [node, vmid] });
                return options.operationResult ?? { success: true, upid: "UPID:shutdown" };
            },
            stopVM: async (node: string, vmid: string) => {
                calls.push({ method: "stopVM", args: [node, vmid] });
                return options.operationResult ?? { success: true, upid: "UPID:stop" };
            },
            rebootVM: async (node: string, vmid: string) => {
                calls.push({ method: "rebootVM", args: [node, vmid] });
                return options.operationResult ?? { success: true, upid: "UPID:reboot" };
            },
            resetVM: async (node: string, vmid: string) => {
                calls.push({ method: "resetVM", args: [node, vmid] });
                return options.operationResult ?? { success: true, upid: "UPID:reset" };
            },
            waitForTaskCompletion: async (node: string, upid: string, label?: string) => {
                calls.push({ method: "waitForTaskCompletion", args: [node, upid, label] });
                return options.waitResult ?? { success: true };
            },
            ensureUniqueGuestNetworkIdentity: async (node: string, vmid: string, timeoutMs?: number) => {
                calls.push({ method: "ensureUniqueGuestNetworkIdentity", args: [node, vmid, timeoutMs] });
                return options.identityResult ?? { success: true, stdout: "ok" };
            }
        },
        config: {
            bootNormalizeGuestNetwork: options.normalize ?? false,
            bootGuestIdentityTimeoutMs: 1234
        }
    });

    return { calls, service };
}

describe("VMOperationExecutionService", () => {
    it("boots a stopped VM and waits for the PVE task", async () => {
        const { service, calls } = makeService();

        await expect(service.execute({
            user,
            isSuperAdmin: false,
            vmId: "507f1f77bcf86cd799439011",
            operation: "boot"
        })).resolves.toMatchObject({
            code: 200,
            message: "VM started successfully",
            body: {
                upid: "UPID:start"
            }
        });

        expect(calls.map(call => call.method)).toEqual([
            "findById",
            "getVMStatus",
            "startVM",
            "waitForTaskCompletion"
        ]);
    });

    it("rejects non-owner operations unless the actor is a superadmin", async () => {
        const { service } = makeService({
            vm: {
                ...vm,
                owner: "other-user"
            }
        });

        await expect(service.execute({
            user,
            isSuperAdmin: false,
            vmId: "507f1f77bcf86cd799439011",
            operation: "boot"
        })).resolves.toMatchObject({
            code: 403,
            message: "You don't have permission to operate this VM"
        });
    });

    it("returns operation failure messages from VMUtils", async () => {
        const { service } = makeService({
            operationResult: {
                success: false,
                errorMessage: "PVE refused"
            }
        });

        await expect(service.execute({
            user,
            isSuperAdmin: false,
            vmId: "507f1f77bcf86cd799439011",
            operation: "boot"
        })).resolves.toMatchObject({
            code: 500,
            message: "PVE refused"
        });
    });

    it("normalizes guest network identity after boot when enabled", async () => {
        const { service, calls } = makeService({
            normalize: true
        });

        await service.execute({
            user,
            isSuperAdmin: false,
            vmId: "507f1f77bcf86cd799439011",
            operation: "boot"
        });

        expect(calls).toContainEqual({
            method: "ensureUniqueGuestNetworkIdentity",
            args: ["pve-a", "101", 1234]
        });
    });
});
