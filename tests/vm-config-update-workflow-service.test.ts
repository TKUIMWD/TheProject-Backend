import { describe, expect, it } from "vitest";
import { VM_Task_Status } from "../src/interfaces/VM/VM_Task";
import { VMConfigUpdateWorkflowService } from "../src/modules/vm/VMConfigUpdateWorkflowService";

const vmId = "507f1f77bcf86cd799439041";
const userId = "507f1f77bcf86cd799439042";

function makeUser(overrides: Record<string, unknown> = {}) {
    return {
        _id: userId,
        username: "student",
        email: "student@example.com",
        role: "user",
        course_ids: [],
        owned_vms: [vmId],
        owned_templates: [],
        password_hash: "",
        isVerified: true,
        compute_resource_plan_id: "",
        used_compute_resource_id: "",
        ...overrides
    } as any;
}

function makeService(options: {
    vm?: any | null;
    currentConfig?: any | null;
    vmStatus?: any | null;
    resourceCheckCode?: number;
    configResult?: { success: boolean; errorMessage?: string };
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];

    const service = new VMConfigUpdateWorkflowService({
        vmRepo: {
            findById: async (id) => {
                calls.push({ method: "findVmById", args: [id] });
                return options.vm === undefined ? { _id: id, pve_node: "pve-a", pve_vmid: "101" } : options.vm;
            }
        },
        taskRepo: {
            createTask: async (task) => {
                calls.push({ method: "createTask", args: [task] });
            },
            updateTask: async (taskId, update) => {
                calls.push({ method: "updateTask", args: [taskId, update] });
            }
        },
        resourceAccountingService: {
            checkUpdateLimits: async (input) => {
                calls.push({ method: "checkUpdateLimits", args: [input] });
                return {
                    code: options.resourceCheckCode ?? 200,
                    message: options.resourceCheckCode === 403 ? "Resource limit exceeded" : "ok",
                    body: undefined
                };
            },
            incrementUsage: async (...args) => {
                calls.push({ method: "incrementUsage", args });
            }
        },
        configExecutionService: {
            updateVMConfiguration: async (input) => {
                calls.push({ method: "updateVMConfiguration", args: [input] });
                return options.configResult ?? { success: true };
            }
        },
        vmUtils: {
            getCurrentVMConfig: async (node, vmid) => {
                calls.push({ method: "getCurrentVMConfig", args: [node, vmid] });
                return options.currentConfig === undefined
                    ? { cores: 2, memory: "2048", scsi0: "NFS:vm-101-disk-0,size=20G" }
                    : options.currentConfig;
            },
            getVMStatus: async (node, vmid) => {
                calls.push({ method: "getVMStatus", args: [node, vmid] });
                return options.vmStatus === undefined ? { status: "stopped" } : options.vmStatus;
            }
        },
        extractDiskSize: () => 20
    });

    return { calls, service };
}

describe("VMConfigUpdateWorkflowService", () => {
    it("updates stopped VM config, records resource deltas, and completes the task", async () => {
        const { service, calls } = makeService();

        await expect(service.updateVMConfig({
            user: makeUser(),
            body: {
                vm_id: vmId,
                cpuCores: 4,
                memorySize: 4096,
                diskSize: 30,
                vmName: "Better VM"
            }
        })).resolves.toMatchObject({
            code: 200,
            message: "VM configuration updated successfully",
            body: {
                vm_id: vmId,
                pve_vmid: "101",
                updated_config: {
                    cpu_cores: 4,
                    memory_size: 4096,
                    disk_size: 30,
                    vm_name: "better-vm"
                }
            }
        });

        expect(calls).toEqual(expect.arrayContaining([
            expect.objectContaining({ method: "checkUpdateLimits" }),
            expect.objectContaining({ method: "createTask" }),
            expect.objectContaining({ method: "updateVMConfiguration" }),
            { method: "incrementUsage", args: [userId, 2, 2048, 10] },
            expect.objectContaining({ method: "updateTask" })
        ]));
        const configCall = calls.find((call) => call.method === "updateVMConfiguration");
        expect(configCall?.args[0]).toMatchObject({
            node: "pve-a",
            vmid: "101",
            currentCpuCores: 2,
            newCpuCores: 4,
            vmName: "better-vm"
        });
    });

    it("rejects users who do not own the VM before VM lookup", async () => {
        const { service, calls } = makeService();

        await expect(service.updateVMConfig({
            user: makeUser({ owned_vms: [] }),
            body: { vm_id: vmId, cpuCores: 4 }
        })).resolves.toMatchObject({
            code: 403,
            message: "Access denied: VM not owned by user"
        });

        expect(calls).toEqual([]);
    });

    it("requires stopped VM status", async () => {
        const { service, calls } = makeService({
            vmStatus: { status: "running" }
        });

        await expect(service.updateVMConfig({
            user: makeUser(),
            body: { vm_id: vmId, memorySize: 4096 }
        })).resolves.toMatchObject({
            code: 400,
            message: "VM must be stopped before updating configuration. Please shut down the VM first."
        });

        expect(calls.some((call) => call.method === "createTask")).toBe(false);
    });

    it("returns quota failures before creating a task", async () => {
        const { service, calls } = makeService({
            resourceCheckCode: 403
        });

        await expect(service.updateVMConfig({
            user: makeUser(),
            body: { vm_id: vmId, cpuCores: 6 }
        })).resolves.toMatchObject({
            code: 403,
            message: "Resource limit exceeded"
        });

        expect(calls.some((call) => call.method === "createTask")).toBe(false);
    });

    it("marks the task failed when execution fails", async () => {
        const { service, calls } = makeService({
            configResult: { success: false, errorMessage: "PVE rejected update" }
        });

        await expect(service.updateVMConfig({
            user: makeUser(),
            body: { vm_id: vmId, diskSize: 25 }
        })).resolves.toMatchObject({
            code: 500,
            message: "VM configuration update failed: PVE rejected update"
        });

        const failureUpdate = calls.find((call) => call.method === "updateTask" && JSON.stringify(call.args[1]).includes(VM_Task_Status.FAILED));
        expect(failureUpdate).toBeDefined();
        expect(calls.some((call) => call.method === "incrementUsage")).toBe(false);
    });
});
