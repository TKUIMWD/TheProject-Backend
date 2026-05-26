import { describe, expect, it } from "vitest";
import { PVE_TASK_EXIT_STATUS, PVE_TASK_STATUS } from "../src/interfaces/PVE";
import { VM_Task_Status } from "../src/interfaces/VM/VM_Task";
import { VMConfigExecutionService } from "../src/modules/vm/VMConfigExecutionService";
import { VM_CREATION_STEP_INDICES, VM_UPDATE_CONFIG_STEP_INDICES } from "../src/modules/vm/VMTaskFactory";

function makeService(overrides: {
    vmUtils?: Record<string, unknown>;
    pveClient?: Record<string, unknown>;
} = {}) {
    const taskUpdates: Array<{ taskId: string; update: unknown }> = [];
    const pveCalls: Array<{ method: string; url: string }> = [];
    const vmUtilsCalls: Array<{ method: string; args: unknown[] }> = [];

    const taskRepository = {
        updateTask: async (taskId: string, update: unknown) => {
            taskUpdates.push({ taskId, update });
        }
    };

    const pveClient = overrides.pveClient ?? {
        request: async (method: string, url: string) => {
            pveCalls.push({ method, url });
            if (url.includes("/tasks/")) {
                return {
                    data: {
                        status: PVE_TASK_STATUS.STOPPED,
                        exitstatus: PVE_TASK_EXIT_STATUS.OK
                    }
                };
            }

            return {
                data: {
                    scsi0: "local-lvm:vm-101-disk-0.qcow2,size=10G"
                }
            };
        }
    };

    const baseVMUtils = {
        waitForTaskCompletion: async (...args: unknown[]) => {
            vmUtilsCalls.push({ method: "waitForTaskCompletion", args });
            return { success: true };
        },
        waitForVMDiskReady: async (...args: unknown[]) => {
            vmUtilsCalls.push({ method: "waitForVMDiskReady", args });
            return { success: true };
        },
        getVMConfig: async (...args: unknown[]) => {
            vmUtilsCalls.push({ method: "getVMConfig", args });
            return { scsi0: "local-lvm:vm-101-disk-0.qcow2,size=10G" };
        },
        updateVMName: async (...args: unknown[]) => {
            vmUtilsCalls.push({ method: "updateVMName", args });
            return { success: true, upid: "UPID:name" };
        },
        configureVMCPU: async (...args: unknown[]) => {
            vmUtilsCalls.push({ method: "configureVMCPU", args });
            return { success: true, upid: "UPID:cpu" };
        },
        configureVMMemory: async (...args: unknown[]) => {
            vmUtilsCalls.push({ method: "configureVMMemory", args });
            return { success: true, upid: "UPID:memory" };
        },
        resizeVMDisk: async (...args: unknown[]) => {
            vmUtilsCalls.push({ method: "resizeVMDisk", args });
            return { success: true, upid: "UPID:disk" };
        },
        configureCloudInit: async (...args: unknown[]) => {
            vmUtilsCalls.push({ method: "configureCloudInit", args });
            return { success: true, upid: "UPID:cloud-init" };
        },
        regenerateCloudInit: async (...args: unknown[]) => {
            vmUtilsCalls.push({ method: "regenerateCloudInit", args });
            return { success: true, upid: "UPID:regen" };
        }
    };

    const service = new VMConfigExecutionService({
        taskRepository,
        pveClient: pveClient as any,
        vmUtils: { ...baseVMUtils, ...overrides.vmUtils } as any,
        sleep: async () => undefined,
        diskReadyRetryDelayMs: 0,
        stabilizeDelayMs: 0
    });

    return {
        service,
        taskUpdates,
        pveCalls,
        vmUtilsCalls
    };
}

describe("VMConfigExecutionService", () => {
    it("configures a cloned VM and records task step progress", async () => {
        const { service, taskUpdates, vmUtilsCalls } = makeService();

        await expect(service.configureClonedVM({
            targetNode: "pve-target",
            vmid: "101",
            cpuCores: 2,
            memorySize: 4096,
            diskSize: 20,
            cloneUpid: "UPID:clone",
            sourceNode: "pve-source",
            taskId: "task-1",
            ciuser: "student",
            cipassword: "secret"
        })).resolves.toEqual({ success: true });

        expect(vmUtilsCalls.map(call => call.method)).toEqual([
            "configureVMCPU",
            "waitForTaskCompletion",
            "configureVMMemory",
            "waitForTaskCompletion",
            "getVMConfig",
            "resizeVMDisk",
            "waitForTaskCompletion",
            "configureCloudInit",
            "waitForTaskCompletion"
        ]);
        expect(taskUpdates).toEqual(expect.arrayContaining([
            expect.objectContaining({
                taskId: "task-1",
                update: expect.objectContaining({
                    [`steps.${VM_CREATION_STEP_INDICES.CLONE}.step_status`]: VM_Task_Status.COMPLETED,
                    [`steps.${VM_CREATION_STEP_INDICES.CLONE}.pve_upid`]: "UPID:clone"
                })
            }),
            expect.objectContaining({
                taskId: "task-1",
                update: expect.objectContaining({
                    [`steps.${VM_CREATION_STEP_INDICES.CLOUD_INIT}.step_status`]: VM_Task_Status.COMPLETED,
                    [`steps.${VM_CREATION_STEP_INDICES.CLOUD_INIT}.pve_upid`]: "Cloud-Init configuration completed"
                })
            })
        ]));
    });

    it("updates only changed VM configuration sections and regenerates cloud-init", async () => {
        const { service, vmUtilsCalls } = makeService();

        await expect(service.updateVMConfiguration({
            node: "pve-node",
            vmid: "101",
            currentCpuCores: 1,
            currentMemorySize: 2048,
            currentDiskSize: 10,
            newCpuCores: 2,
            newMemorySize: 2048,
            newDiskSize: 10,
            taskId: "task-2",
            ciuser: "student",
            cipassword: "secret",
            vmName: "training-box"
        })).resolves.toEqual({ success: true });

        expect(vmUtilsCalls.map(call => call.method)).toEqual([
            "waitForVMDiskReady",
            "updateVMName",
            "waitForTaskCompletion",
            "configureVMCPU",
            "waitForTaskCompletion",
            "configureCloudInit",
            "waitForTaskCompletion",
            "regenerateCloudInit"
        ]);
    });

    it("returns the prefixed VM update error when a config operation fails", async () => {
        const { service, taskUpdates } = makeService({
            vmUtils: {
                configureVMCPU: async () => ({ success: false, errorMessage: "bad cpu" })
            }
        });

        await expect(service.updateVMConfiguration({
            node: "pve-node",
            vmid: "101",
            currentCpuCores: 1,
            currentMemorySize: 2048,
            currentDiskSize: 10,
            newCpuCores: 2,
            newMemorySize: 2048,
            newDiskSize: 10,
            taskId: "task-3"
        })).resolves.toEqual({
            success: false,
            errorMessage: "CPU configuration failed: bad cpu"
        });

        expect(taskUpdates).toContainEqual(expect.objectContaining({
            taskId: "task-3",
            update: expect.objectContaining({
                [`steps.${VM_UPDATE_CONFIG_STEP_INDICES.CPU}.step_status`]: VM_Task_Status.FAILED,
                [`steps.${VM_UPDATE_CONFIG_STEP_INDICES.CPU}.error_message`]: "bad cpu"
            })
        }));
    });
});
