import { describe, expect, it } from "vitest";
import { VM_Task_Status } from "../src/interfaces/VM/VM_Task";
import { TemplateCloneService } from "../src/modules/templates/TemplateCloneService";

const templateId = "507f1f77bcf86cd799439031";
const userId = "507f1f77bcf86cd799439032";
const fixedNow = new Date("2026-05-26T10:00:00.000Z");

function makeUser() {
    return {
        _id: userId,
        username: "root",
        email: "root@example.com",
        role: "superadmin",
        course_ids: [],
        owned_vms: [],
        owned_templates: [],
        password_hash: "",
        isVerified: true,
        compute_resource_plan_id: "",
        used_compute_resource_id: ""
    } as any;
}

function makeSourceTemplate(overrides: Record<string, unknown> = {}) {
    return {
        _id: templateId,
        description: "Ubuntu base",
        pve_vmid: "9000",
        pve_node: "pve-a",
        owner: userId,
        ciuser: "student",
        cipassword: "secret",
        ...overrides
    };
}

function makeService(options: {
    sourceTemplate?: any | null;
    nextId?: any;
    cloneResult?: { success: boolean; upid?: string; errorMessage?: string };
    cloneWaitResult?: { success: boolean; errorMessage?: string };
    convertResult?: { success: boolean; upid?: string; errorMessage?: string };
    convertWaitResult?: { success: boolean; errorMessage?: string };
    taskUpdateError?: Error;
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    let waitCallCount = 0;

    const service = new TemplateCloneService({
        templateRepo: {
            findById: async (id) => {
                calls.push({ method: "findTemplateById", args: [id] });
                return options.sourceTemplate === undefined ? makeSourceTemplate() : options.sourceTemplate;
            },
            create: async (payload) => {
                calls.push({ method: "createTemplate", args: [payload] });
                return { _id: "new-template-1" };
            }
        },
        userRepo: {
            pushOwnedTemplate: async (id, newTemplateId) => {
                calls.push({ method: "pushOwnedTemplate", args: [id, newTemplateId] });
            }
        },
        taskRepo: {
            create: async (task) => {
                calls.push({ method: "createTask", args: [task] });
            },
            updateOne: async (query, update) => {
                calls.push({ method: "updateTask", args: [query, update] });
                if (options.taskUpdateError) throw options.taskUpdateError;
            }
        },
        vmUtils: {
            getNextVMId: async () => {
                calls.push({ method: "getNextVMId", args: [] });
                return options.nextId ?? { code: 200, message: "ok", body: { data: "9100" } };
            },
            cloneVM: async (...args) => {
                calls.push({ method: "cloneVM", args });
                return options.cloneResult ?? { success: true, upid: "UPID:clone" };
            },
            waitForTaskCompletion: async (node, upid, label) => {
                calls.push({ method: "waitForTaskCompletion", args: [node, upid, label] });
                waitCallCount += 1;
                return waitCallCount === 1
                    ? options.cloneWaitResult ?? { success: true }
                    : options.convertWaitResult ?? { success: true };
            },
            convertVMToTemplate: async (...args) => {
                calls.push({ method: "convertVMToTemplate", args });
                return options.convertResult ?? { success: true, upid: "UPID:convert" };
            },
            deleteVMWithDiskCleanup: async (...args) => {
                calls.push({ method: "deleteVMWithDiskCleanup", args });
            }
        },
        sanitizeVMName: (name) => name.toLowerCase().replaceAll(" ", "-"),
        now: () => fixedNow
    });

    return { calls, service };
}

describe("TemplateCloneService", () => {
    it("clones a source template, converts it back to a template, and persists ownership", async () => {
        const { service, calls } = makeService();

        await expect(service.cloneTemplate({
            user: makeUser(),
            body: {
                template_id: templateId,
                new_template_name: "Blue Team Box",
                description: "New template",
                target_node: "pve-b",
                storage: "local-zfs"
            }
        })).resolves.toMatchObject({
            code: 200,
            message: "Template cloned successfully",
            body: {
                template_id: "new-template-1",
                task_id: `clone-template-${templateId}-${fixedNow.getTime()}-${userId}`
            }
        });

        expect(calls).toContainEqual({
            method: "cloneVM",
            args: ["pve-a", "9000", "9100", "blue-team-box", "pve-b", "local-zfs", "1"]
        });
        expect(calls).toContainEqual({
            method: "convertVMToTemplate",
            args: ["pve-b", "9100"]
        });
        expect(calls).toContainEqual({
            method: "pushOwnedTemplate",
            args: [userId, "new-template-1"]
        });
        const createTemplateCall = calls.find((call) => call.method === "createTemplate");
        expect(createTemplateCall?.args[0]).toMatchObject({
            description: "New template",
            pve_vmid: "9100",
            pve_node: "pve-b",
            owner: userId,
            ciuser: "student",
            cipassword: "secret",
            is_public: false
        });
    });

    it("validates required fields before loading the template", async () => {
        const { service, calls } = makeService();

        await expect(service.cloneTemplate({
            user: makeUser(),
            body: { template_id: templateId }
        })).resolves.toMatchObject({
            code: 400,
            message: "Missing required fields: template_id, new_template_name, description"
        });

        expect(calls).toEqual([]);
    });

    it("returns clone API failures without creating a template record", async () => {
        const { service, calls } = makeService({
            cloneResult: { success: false, errorMessage: "storage full" }
        });

        await expect(service.cloneTemplate({
            user: makeUser(),
            body: { template_id: templateId, new_template_name: "Clone", description: "New template" }
        })).resolves.toMatchObject({
            code: 500,
            message: "Failed to clone template: storage full"
        });

        expect(calls.some((call) => call.method === "createTemplate")).toBe(false);
        const failureUpdate = calls.find((call) => call.method === "updateTask" && JSON.stringify(call.args[1]).includes("storage full"));
        expect(failureUpdate?.args[1]).toMatchObject({
            $set: {
                status: VM_Task_Status.FAILED,
                "steps.0.step_status": VM_Task_Status.FAILED
            }
        });
    });

    it("cleans up the cloned VM when conversion fails", async () => {
        const { service, calls } = makeService({
            convertResult: { success: false, errorMessage: "cannot convert" }
        });

        await expect(service.cloneTemplate({
            user: makeUser(),
            body: { template_id: templateId, new_template_name: "Clone", description: "New template" }
        })).resolves.toMatchObject({
            code: 500,
            message: "Failed to convert cloned VM to template: cannot convert"
        });

        expect(calls).toContainEqual({
            method: "deleteVMWithDiskCleanup",
            args: ["gapveb", "9100"]
        });
        expect(calls.some((call) => call.method === "createTemplate")).toBe(false);
    });

    it("returns conversion wait failures without creating a template record", async () => {
        const { service, calls } = makeService({
            convertWaitResult: { success: false, errorMessage: "task failed" }
        });

        await expect(service.cloneTemplate({
            user: makeUser(),
            body: { template_id: templateId, new_template_name: "Clone", description: "New template" }
        })).resolves.toMatchObject({
            code: 500,
            message: "Template conversion failed: task failed"
        });

        expect(calls.some((call) => call.method === "createTemplate")).toBe(false);
    });
});
