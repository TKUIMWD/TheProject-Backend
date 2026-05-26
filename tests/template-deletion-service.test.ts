import { describe, expect, it } from "vitest";
import Roles from "../src/enum/role";
import { TemplateDeletionService } from "../src/modules/templates/TemplateDeletionService";

const templateId = "507f1f77bcf86cd7994390d1";
const ownerId = "507f1f77bcf86cd7994390d2";
const otherUserId = "507f1f77bcf86cd7994390d3";

function makeUser(overrides: Record<string, unknown> = {}) {
    return {
        _id: ownerId,
        username: "owner",
        email: "owner@example.com",
        role: Roles.Admin,
        course_ids: [],
        owned_vms: [],
        owned_templates: [templateId],
        password_hash: "",
        isVerified: true,
        compute_resource_plan_id: "",
        used_compute_resource_id: "used-1",
        ...overrides
    } as any;
}

function makeTemplate(overrides: Record<string, unknown> = {}) {
    return {
        _id: templateId,
        owner: ownerId,
        pve_node: "pve-a",
        pve_vmid: "9000",
        ...overrides
    };
}

function makeConfig() {
    return {
        cores: 4,
        memory: 8192,
        scsi0: "NFS:vm-9000-disk-0,size=32G"
    } as any;
}

function makeService(options: {
    template?: any | null;
    config?: any | null;
    configError?: Error;
    deleteResult?: { success: boolean; upid?: string; errorMessage?: string };
    waitResult?: { success: boolean; errorMessage?: string };
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const service = new TemplateDeletionService({
        templateRepo: {
            findById: async (id) => {
                calls.push({ method: "findById", args: [id] });
                return options.template === undefined ? makeTemplate() : options.template;
            },
            deleteById: async (id) => {
                calls.push({ method: "deleteById", args: [id] });
            }
        },
        userRepo: {
            findById: async (id) => {
                calls.push({ method: "findUserById", args: [id] });
                return { _id: id, used_compute_resource_id: "used-1" };
            },
            pullOwnedTemplate: async (id, idToPull) => {
                calls.push({ method: "pullOwnedTemplate", args: [id, idToPull] });
            }
        },
        resourceRepo: {
            incrementUsedResource: async (id, update) => {
                calls.push({ method: "incrementUsedResource", args: [id, update] });
            }
        },
        vmUtils: {
            getCurrentVMConfig: async (node, vmid) => {
                calls.push({ method: "getCurrentVMConfig", args: [node, vmid] });
                if (options.configError) throw options.configError;
                return options.config === undefined ? makeConfig() : options.config;
            },
            deleteTemplate: async (node, vmid) => {
                calls.push({ method: "deleteTemplate", args: [node, vmid] });
                return options.deleteResult ?? { success: true, upid: "UPID:delete" };
            },
            waitForTaskCompletion: async (node, upid, label) => {
                calls.push({ method: "waitForTaskCompletion", args: [node, upid, label] });
                return options.waitResult ?? { success: true };
            }
        },
        extractDiskSize: () => 32
    });

    return { calls, service };
}

describe("TemplateDeletionService", () => {
    it("deletes a template, waits for PVE completion, and reclaims resources", async () => {
        const { service, calls } = makeService();

        await expect(service.deleteTemplate({
            user: makeUser(),
            templateId
        })).resolves.toMatchObject({
            code: 200,
            message: "Template deleted successfully",
            body: templateId
        });

        expect(calls.map((call) => call.method)).toEqual([
            "findById",
            "getCurrentVMConfig",
            "deleteTemplate",
            "waitForTaskCompletion",
            "findUserById",
            "incrementUsedResource",
            "pullOwnedTemplate",
            "deleteById"
        ]);
        expect(calls).toContainEqual({
            method: "incrementUsedResource",
            args: ["used-1", { cpu_cores: -4, memory: -8192, storage: -32 }]
        });
    });

    it("rejects deletion from users who do not own the template", async () => {
        const { service, calls } = makeService();

        await expect(service.deleteTemplate({
            user: makeUser({ _id: otherUserId }),
            templateId
        })).resolves.toMatchObject({
            code: 403,
            message: "Access denied: You don't have permission to delete this template"
        });
        expect(calls.some((call) => call.method === "deleteTemplate")).toBe(false);
    });

    it("returns PVE delete failures without changing database ownership", async () => {
        const { service, calls } = makeService({
            deleteResult: { success: false, errorMessage: "locked" }
        });

        await expect(service.deleteTemplate({
            user: makeUser(),
            templateId
        })).resolves.toMatchObject({
            code: 500,
            message: "Failed to delete template from PVE: locked"
        });
        expect(calls.some((call) => call.method === "pullOwnedTemplate")).toBe(false);
        expect(calls.some((call) => call.method === "deleteById")).toBe(false);
    });

    it("continues deletion when config lookup fails and skips resource reclaim", async () => {
        const { service, calls } = makeService({
            configError: new Error("PVE unavailable"),
            deleteResult: { success: true }
        });

        await expect(service.deleteTemplate({
            user: makeUser(),
            templateId
        })).resolves.toMatchObject({
            code: 200,
            message: "Template deleted successfully"
        });
        expect(calls.some((call) => call.method === "incrementUsedResource")).toBe(false);
        expect(calls).toContainEqual({ method: "pullOwnedTemplate", args: [ownerId, templateId] });
        expect(calls).toContainEqual({ method: "deleteById", args: [templateId] });
    });
});
