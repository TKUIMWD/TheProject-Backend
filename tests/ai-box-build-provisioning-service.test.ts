import { describe, expect, it } from "vitest";
import { AIBoxBuildExecutionStatus } from "../src/interfaces/AIBoxBuildJob";
import { AIBoxBuildProvisioningService } from "../src/modules/ai-box-build/AIBoxBuildProvisioningService";

function makeRunConfig() {
    return {
        template_id: "template-1",
        target: "pve-a",
        name: "ai-box-job-1",
        cpuCores: 2,
        memorySize: 4096,
        diskSize: 40,
        ciuser: "student",
        cipassword: "secret"
    };
}

function makeService(options: {
    createCode?: number;
    createBody?: any;
    vmRecord?: any;
    networkIpBatches?: string[][];
    ipWaitAttempts?: number;
} = {}) {
    const updates: Array<{ jobId: string; update: any }> = [];
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const networkIpBatches = [...(options.networkIpBatches ?? [["10.0.0.5"]])];

    const vmCreationService = {
        createFromTemplate: async (input: any) => {
            calls.push({ method: "createFromTemplate", args: [input] });
            return {
                code: options.createCode ?? 200,
                message: options.createCode ? "bad gateway" : "ok",
                body: options.createBody ?? { vmid: "101", task_id: "UPID:clone" }
            };
        }
    };
    const jobRepository = {
        updateById: async (jobId: string, update: unknown) => {
            updates.push({ jobId, update });
        }
    };
    const vmRepository = {
        findByOwnerAndPVE: async (...args: string[]) => {
            calls.push({ method: "findByOwnerAndPVE", args });
            return options.vmRecord ?? { _id: { toString: () => "vm-record-1" } };
        }
    };
    const vmUtils = {
        getVMStatus: async (...args: string[]) => {
            calls.push({ method: "getVMStatus", args });
            return { status: "stopped" };
        },
        startVM: async (...args: string[]) => {
            calls.push({ method: "startVM", args });
            return { success: true, upid: "UPID:start" };
        },
        waitForTaskCompletion: async (...args: string[]) => {
            calls.push({ method: "waitForTaskCompletion", args });
            return { success: true };
        },
        getVMConfig: async (...args: string[]) => {
            calls.push({ method: "getVMConfig", args });
            return { ipconfig0: "ip=dhcp" };
        },
        regenerateCloudInit: async (...args: string[]) => {
            calls.push({ method: "regenerateCloudInit", args });
            return { success: true };
        },
        ensureUniqueGuestNetworkIdentity: async (...args: string[]) => {
            calls.push({ method: "ensureUniqueGuestNetworkIdentity", args });
            return { success: true, stdout: "network_identity=changed\ninterface=eth0" };
        },
        getVMNetworkInfo: async (...args: string[]) => {
            calls.push({ method: "getVMNetworkInfo", args });
            return { success: true, interfaces: [{ name: "eth0" }] };
        },
        extractIPAddresses: (interfaces: any[]) => {
            calls.push({ method: "extractIPAddresses", args: [interfaces] });
            return networkIpBatches.shift() ?? [];
        }
    };
    const pveRequests: Array<{ method: string; url: string; body?: unknown }> = [];
    const pveClient = {
        request: async (method: "PUT", url: string, body?: unknown) => {
            pveRequests.push({ method, url, body });
        }
    };

    return {
        calls,
        pveRequests,
        service: new AIBoxBuildProvisioningService({
            vmCreationService,
            jobRepository,
            vmRepository,
            vmUtils,
            pveClient,
            sleep: async () => undefined,
            config: {
                prepareCloudInit: true,
                ipconfig0: "ip=dhcp",
                normalizeGuestNetwork: true,
                guestIdentityTimeoutMs: 1000,
                ipWaitAttempts: options.ipWaitAttempts ?? 1,
                ipWaitMs: 0,
                vmRecordWaitAttempts: 1,
                vmRecordWaitMs: 0
            }
        }),
        updates
    };
}

describe("AIBoxBuildProvisioningService", () => {
    it("creates, boots, normalizes, and resolves a VM network address", async () => {
        const { service, updates, calls, pveRequests } = makeService();

        const result = await service.provisionAndBootVM({
            jobId: "job-1",
            config: makeRunConfig(),
            authorizationHeader: "Bearer token",
            userSnapshot: { _id: "user-1", role: "admin", email: "user@example.test", username: "alice" } as any
        });

        expect(result).toEqual({
            vmId: "vm-record-1",
            pveVmid: "101",
            pveNode: "pve-a",
            vmIp: "10.0.0.5",
            sshUser: "student",
            sshPassword: "secret"
        });
        expect(calls.find(call => call.method === "createFromTemplate")?.args[0]).toMatchObject({
            user: { _id: "user-1", role: "admin", email: "user@example.test" },
            body: {
                template_id: "template-1",
                name: "ai-box-job-1",
                target: "pve-a",
                cpuCores: 2,
                memorySize: 4096,
                diskSize: 40,
                ciuser: "student",
                cipassword: "secret"
            }
        });
        expect(calls.map(call => call.method)).toEqual([
            "createFromTemplate",
            "findByOwnerAndPVE",
            "getVMConfig",
            "regenerateCloudInit",
            "getVMStatus",
            "startVM",
            "waitForTaskCompletion",
            "ensureUniqueGuestNetworkIdentity",
            "getVMNetworkInfo",
            "extractIPAddresses"
        ]);
        expect(pveRequests).toHaveLength(0);
        expect(updates).toEqual(expect.arrayContaining([
            expect.objectContaining({
                update: expect.objectContaining({ execution_status: AIBoxBuildExecutionStatus.provisioning })
            }),
            expect.objectContaining({
                update: expect.objectContaining({ pve_vmid: "101", pve_node: "pve-a", task_id: "UPID:clone" })
            }),
            expect.objectContaining({
                update: expect.objectContaining({ vm_id: "vm-record-1" })
            }),
            expect.objectContaining({
                update: expect.objectContaining({ execution_status: AIBoxBuildExecutionStatus.booting })
            }),
            expect.objectContaining({
                update: expect.objectContaining({ execution_status: AIBoxBuildExecutionStatus.waiting_for_network })
            }),
            expect.objectContaining({
                update: expect.objectContaining({ vm_ip: "10.0.0.5" })
            })
        ]));
    });

    it("throws a stable VM creation error", async () => {
        const { service } = makeService({ createCode: 502, createBody: undefined });

        await expect(service.provisionAndBootVM({
            jobId: "job-1",
            config: makeRunConfig(),
            authorizationHeader: "Bearer token",
            userSnapshot: { _id: "user-1", role: "admin" }
        })).rejects.toThrow("VM creation failed: 502 bad gateway");
    });

    it("times out when the guest agent never reports an IP address", async () => {
        const { service, updates } = makeService({
            networkIpBatches: [[], [], [], [], [], []],
            ipWaitAttempts: 6
        });

        await expect(service.provisionAndBootVM({
            jobId: "job-1",
            config: makeRunConfig(),
            authorizationHeader: "Bearer token",
            userSnapshot: { _id: "user-1", role: "admin" }
        })).rejects.toThrow("Timed out waiting for VM IP from QEMU guest agent");

        expect(updates).toEqual(expect.arrayContaining([
            expect.objectContaining({
                update: expect.objectContaining({
                    $push: expect.objectContaining({
                        run_logs: expect.objectContaining({
                            $each: [
                                expect.objectContaining({
                                    stage: "network",
                                    message: "Still waiting for VM IP (6/6)."
                                })
                            ]
                        })
                    })
                })
            })
        ]));
    });
});
