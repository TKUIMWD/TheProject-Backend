import { describe, expect, it } from "vitest";
import Roles from "../src/enum/role";
import { TemplateConfigUpdateService } from "../src/modules/templates/TemplateConfigUpdateService";

const templateId = "507f1f77bcf86cd7994390e1";
const ownerId = "507f1f77bcf86cd7994390e2";
const otherUserId = "507f1f77bcf86cd7994390e3";

function makeUser(overrides: Record<string, unknown> = {}) {
    return {
        _id: ownerId,
        username: "owner",
        email: "owner@example.test",
        role: Roles.Admin,
        course_ids: [],
        owned_vms: [],
        owned_templates: [templateId],
        password_hash: "",
        isVerified: true,
        compute_resource_plan_id: "",
        used_compute_resource_id: "",
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

function makeService(options: {
    template?: any | null;
    nameResult?: { success: boolean; upid?: string; errorMessage?: string };
    nameWaitResult?: { success: boolean; errorMessage?: string };
    ciResult?: { success: boolean; upid?: string; errorMessage?: string };
    ciWaitResult?: { success: boolean; errorMessage?: string };
    sanitizeVMName?: (name: string) => string | null;
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const service = new TemplateConfigUpdateService({
        templateRepo: {
            findById: async (...args) => {
                calls.push({ method: "findTemplateById", args });
                return options.template === undefined ? makeTemplate() : options.template;
            },
            updateOne: async (...args) => {
                calls.push({ method: "updateTemplate", args });
            }
        },
        vmUtils: {
            updateVMName: async (...args) => {
                calls.push({ method: "updateVMName", args });
                return options.nameResult ?? { success: true, upid: "UPID:name" };
            },
            configureCloudInit: async (...args) => {
                calls.push({ method: "configureCloudInit", args });
                return options.ciResult ?? { success: true, upid: "UPID:ci" };
            },
            waitForTaskCompletion: async (...args) => {
                calls.push({ method: "waitForTaskCompletion", args });
                const upid = args[1];
                return upid === "UPID:name"
                    ? options.nameWaitResult ?? { success: true }
                    : options.ciWaitResult ?? { success: true };
            }
        },
        sanitizeVMName: options.sanitizeVMName ?? ((name) => name.toLowerCase().replaceAll(" ", "-"))
    });

    return { calls, service };
}

describe("TemplateConfigUpdateService", () => {
    it("updates owner-editable metadata without calling PVE", async () => {
        const { service, calls } = makeService();

        await expect(service.updateTemplateConfig({
            user: makeUser(),
            body: {
                template_id: templateId,
                description: "Updated description"
            }
        })).resolves.toEqual({
            code: 200,
            message: "Template configuration updated successfully",
            body: templateId
        });

        expect(calls).toContainEqual({
            method: "updateTemplate",
            args: [templateId, { description: "Updated description" }]
        });
        expect(calls.map((call) => call.method)).not.toContain("updateVMName");
        expect(calls.map((call) => call.method)).not.toContain("configureCloudInit");
    });

    it("allows superadmin to update public status", async () => {
        const { service, calls } = makeService();

        await expect(service.updateTemplateConfig({
            user: makeUser({ role: Roles.SuperAdmin, _id: otherUserId }),
            body: {
                template_id: templateId,
                is_public: true
            }
        })).resolves.toMatchObject({
            code: 200
        });

        expect(calls).toContainEqual({
            method: "updateTemplate",
            args: [templateId, { is_public: true }]
        });
    });

    it("blocks non-owners and non-superadmins", async () => {
        const { service, calls } = makeService();

        await expect(service.updateTemplateConfig({
            user: makeUser({ _id: otherUserId, role: Roles.User }),
            body: {
                template_id: templateId,
                description: "nope"
            }
        })).resolves.toMatchObject({
            code: 403,
            message: "Access denied: You don't have permission to update this template"
        });

        expect(calls.map((call) => call.method)).not.toContain("updateTemplate");
    });

    it("blocks public status changes from template owners who are not superadmin", async () => {
        const { service } = makeService();

        await expect(service.updateTemplateConfig({
            user: makeUser({ role: Roles.Admin }),
            body: {
                template_id: templateId,
                is_public: true
            }
        })).resolves.toMatchObject({
            code: 403,
            message: "Access denied: Only superadmin can modify template public status"
        });
    });

    it("updates PVE template name and waits for completion", async () => {
        const { service, calls } = makeService();

        await expect(service.updateTemplateConfig({
            user: makeUser(),
            body: {
                template_id: templateId,
                template_name: "Blue Lab"
            }
        })).resolves.toMatchObject({
            code: 200
        });

        expect(calls).toContainEqual({
            method: "updateVMName",
            args: ["pve-a", "9000", "blue-lab"]
        });
        expect(calls).toContainEqual({
            method: "waitForTaskCompletion",
            args: ["pve-a", "UPID:name", "Template name update"]
        });
        expect(calls.map((call) => call.method)).not.toContain("updateTemplate");
    });

    it("updates Cloud-Init through PVE before persisting credentials", async () => {
        const { service, calls } = makeService();

        await expect(service.updateTemplateConfig({
            user: makeUser(),
            body: {
                template_id: templateId,
                ciuser: "student",
                cipassword: "secret"
            }
        })).resolves.toMatchObject({
            code: 200
        });

        expect(calls).toContainEqual({
            method: "configureCloudInit",
            args: ["pve-a", "9000", "student", "secret"]
        });
        expect(calls).toContainEqual({
            method: "waitForTaskCompletion",
            args: ["pve-a", "UPID:ci", "Template CI configuration update"]
        });
        expect(calls).toContainEqual({
            method: "updateTemplate",
            args: [templateId, { ciuser: "student", cipassword: "secret" }]
        });
    });

    it("rejects partial Cloud-Init credentials before PVE calls", async () => {
        const { service, calls } = makeService();

        await expect(service.updateTemplateConfig({
            user: makeUser(),
            body: {
                template_id: templateId,
                ciuser: "student"
            }
        })).resolves.toMatchObject({
            code: 400,
            message: "Both ciuser and cipassword must be provided and non-empty"
        });

        expect(calls.map((call) => call.method)).not.toContain("configureCloudInit");
        expect(calls.map((call) => call.method)).not.toContain("updateTemplate");
    });

    it("returns PVE name update failures without database updates", async () => {
        const { service, calls } = makeService({
            nameResult: { success: false, errorMessage: "locked" }
        });

        await expect(service.updateTemplateConfig({
            user: makeUser(),
            body: {
                template_id: templateId,
                description: "Updated description",
                template_name: "Blue Lab"
            }
        })).resolves.toMatchObject({
            code: 500,
            message: "Failed to update template name: locked"
        });

        expect(calls.map((call) => call.method)).not.toContain("updateTemplate");
    });

    it("returns CI task wait failures without database updates", async () => {
        const { service, calls } = makeService({
            ciWaitResult: { success: false, errorMessage: "task failed" }
        });

        await expect(service.updateTemplateConfig({
            user: makeUser(),
            body: {
                template_id: templateId,
                ciuser: "student",
                cipassword: "secret"
            }
        })).resolves.toMatchObject({
            code: 500,
            message: "Template CI configuration update failed: task failed"
        });

        expect(calls.map((call) => call.method)).not.toContain("updateTemplate");
    });
});
