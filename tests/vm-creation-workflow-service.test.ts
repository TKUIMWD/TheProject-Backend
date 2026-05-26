import { describe, expect, it } from "vitest";
import { VM_Task_Status } from "../src/interfaces/VM/VM_Task";
import { VMCreationWorkflowService } from "../src/modules/vm/VMCreationWorkflowService";

function makeUser() {
    return {
        _id: { toString: () => "user-1" },
        username: "student"
    } as any;
}

function makeTemplateInfo() {
    return {
        pve_node: "pve-source",
        pve_vmid: "9000"
    } as any;
}

function makeInput(overrides: Record<string, unknown> = {}) {
    return {
        user: makeUser(),
        templateId: "template-1",
        templateInfo: makeTemplateInfo(),
        nextId: "101",
        sanitizedName: "student-vm",
        target: "pve-a",
        storage: "NFS",
        full: "1",
        cpuCores: 2,
        memorySize: 4096,
        diskSize: 40,
        ...overrides
    } as any;
}

function makeService(options: {
    cloneSuccess?: boolean;
    configSuccess?: boolean;
    vmRecord?: any;
    boxId?: string;
} = {}) {
    const calls: Array<{ target: string; method: string; args: unknown[] }> = [];
    const tasks = {
        createTask: async (task: any) => {
            calls.push({ target: "tasks", method: "createTask", args: [task] });
        },
        updateTask: async (taskId: string, update: unknown) => {
            calls.push({ target: "tasks", method: "updateTask", args: [taskId, update] });
        },
        listUserTaskRefsNewestFirst: async (userId: string) => {
            calls.push({ target: "tasks", method: "listUserTaskRefsNewestFirst", args: [userId] });
            return [];
        },
        deleteTasksByIds: async (taskIds: string[]) => {
            calls.push({ target: "tasks", method: "deleteTasksByIds", args: [taskIds] });
        }
    };
    const vms = {
        createUserOwnedVM: async (input: unknown) => {
            calls.push({ target: "vms", method: "createUserOwnedVM", args: [input] });
            return "vm-record-1";
        },
        markAsBoxVM: async (vmId: string, boxId: string) => {
            calls.push({ target: "vms", method: "markAsBoxVM", args: [vmId, boxId] });
        },
        findByPVE: async (pveVmid: string, pveNode: string) => {
            calls.push({ target: "vms", method: "findByPVE", args: [pveVmid, pveNode] });
            return options.vmRecord ?? { _id: { toString: () => "vm-record-1" } };
        },
        deleteVMRecord: async (vmId: string) => {
            calls.push({ target: "vms", method: "deleteVMRecord", args: [vmId] });
        },
        detachOwnedVM: async (userId: string, vmId: unknown) => {
            calls.push({ target: "vms", method: "detachOwnedVM", args: [userId, vmId] });
        }
    };
    const vmUtils = {
        cloneVM: async (...args: string[]) => {
            calls.push({ target: "vmUtils", method: "cloneVM", args });
            return options.cloneSuccess === false
                ? { success: false, errorMessage: "clone failed" }
                : { success: true, upid: "UPID:clone" };
        }
    };
    const configExecution = {
        configureClonedVM: async (input: unknown) => {
            calls.push({ target: "configExecution", method: "configureClonedVM", args: [input] });
            return options.configSuccess === false
                ? { success: false, errorMessage: "config failed" }
                : { success: true };
        }
    };
    const resourceAccounting = {
        incrementUsage: async (...args: [string, number, number, number]) => {
            calls.push({ target: "resourceAccounting", method: "incrementUsage", args });
        }
    };
    const pveClient = {
        request: async (...args: ["DELETE", string]) => {
            calls.push({ target: "pveClient", method: "request", args });
        }
    };

    return {
        calls,
        service: new VMCreationWorkflowService({
            tasks,
            vms,
            vmUtils,
            configExecution,
            resourceAccounting,
            pveClient
        })
    };
}

describe("VMCreationWorkflowService", () => {
    it("clones, configures, registers, accounts resources, and returns success", async () => {
        const { service, calls } = makeService();

        await expect(service.cloneConfigureAndRegisterVM(makeInput())).resolves.toMatchObject({
            code: 200,
            body: {
                vmid: "101",
                vm_name: "student-vm"
            }
        });

        expect(calls.map(call => `${call.target}.${call.method}`)).toEqual([
            "tasks.listUserTaskRefsNewestFirst",
            "tasks.createTask",
            "pveClient.request",
            "vmUtils.cloneVM",
            "tasks.updateTask",
            "configExecution.configureClonedVM",
            "resourceAccounting.incrementUsage",
            "vms.createUserOwnedVM",
            "tasks.updateTask"
        ]);
        expect(calls[7]).toEqual({
            target: "vms",
            method: "createUserOwnedVM",
            args: [
                {
                    userId: "user-1",
                    pveVmid: "101",
                    pveNode: "pve-a",
                    fromTemplateId: "template-1"
                }
            ]
        });
    });

    it("marks box VMs after successful registration", async () => {
        const { service, calls } = makeService();

        await service.cloneConfigureAndRegisterVM(makeInput({ boxId: "box-1" }));

        expect(calls).toContainEqual({
            target: "vms",
            method: "markAsBoxVM",
            args: ["vm-record-1", "box-1"]
        });
    });

    it("cleans up PVE and VM records after configuration failure", async () => {
        const { service, calls } = makeService({ configSuccess: false });

        await expect(service.cloneConfigureAndRegisterVM(makeInput())).resolves.toMatchObject({
            code: 500,
            message: "VM created but configuration failed, resources have been cleaned up"
        });

        expect(calls).toEqual(expect.arrayContaining([
            {
                target: "tasks",
                method: "updateTask",
                args: [
                    expect.any(String),
                    expect.objectContaining({
                        status: VM_Task_Status.FAILED,
                        error_message: "config failed"
                    })
                ]
            },
            {
                target: "vms",
                method: "deleteVMRecord",
                args: ["vm-record-1"]
            },
            {
                target: "vms",
                method: "detachOwnedVM",
                args: ["user-1", expect.anything()]
            }
        ]));
    });
});
