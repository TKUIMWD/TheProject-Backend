import { describe, expect, it } from "vitest";
import { TemplateConversionService } from "../src/modules/templates/TemplateConversionService";

const userId = "507f1f77bcf86cd799439011";
const vmId = "507f1f77bcf86cd799439012";
const sourceTemplateId = "507f1f77bcf86cd799439013";

function makeUser(overrides: Record<string, unknown> = {}) {
    return {
        _id: userId,
        username: "student",
        email: "student@example.test",
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

function makeBody(overrides: Record<string, unknown> = {}) {
    return {
        vm_id: vmId,
        ciuser: "student",
        cipassword: "secret",
        description: "Converted template",
        template_name: "Converted Lab",
        ...overrides
    };
}

function makeOwnedVM(overrides: Record<string, unknown> = {}) {
    return {
        _id: vmId,
        owner: userId,
        pve_node: "pve-a",
        pve_vmid: "110",
        fromTemplateId: undefined,
        ...overrides
    };
}

function makeService(options: {
    ownedVM?: any | null;
    sourceTemplate?: any | null;
    validateResult?: any;
    status?: any;
    convertResult?: any;
    waitResult?: any;
    sanitizeVMName?: (name: string) => string;
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];

    const service = new TemplateConversionService({
        vmRepo: {
            findByIdAndOwner: async (...args) => {
                calls.push({ method: "findByIdAndOwner", args });
                return options.ownedVM === undefined ? makeOwnedVM() : options.ownedVM;
            },
            deleteById: async (...args) => {
                calls.push({ method: "deleteVM", args });
            }
        },
        templateRepo: {
            findById: async (...args) => {
                calls.push({ method: "findTemplateById", args });
                return options.sourceTemplate === undefined
                    ? { _id: sourceTemplateId, owner: userId, is_public: false }
                    : options.sourceTemplate;
            },
            create: async (payload) => {
                calls.push({ method: "createTemplate", args: [payload] });
                return { _id: "new-template-1" };
            }
        },
        userRepo: {
            moveVMToTemplate: async (...args) => {
                calls.push({ method: "moveVMToTemplate", args });
            }
        },
        vmUtils: {
            validateVMCreationParams: async (...args) => {
                calls.push({ method: "validateVMCreationParams", args });
                return options.validateResult ?? { code: 200, message: "ok" };
            },
            getVMStatus: async (...args) => {
                calls.push({ method: "getVMStatus", args });
                return options.status ?? { status: "stopped" };
            },
            convertVMToTemplate: async (...args) => {
                calls.push({ method: "convertVMToTemplate", args });
                return options.convertResult ?? { success: true, upid: "UPID:convert" };
            },
            waitForTaskCompletion: async (...args) => {
                calls.push({ method: "waitForTaskCompletion", args });
                return options.waitResult ?? { success: true };
            }
        },
        sanitizeVMName: options.sanitizeVMName ?? ((name) => name.toLowerCase().replaceAll(" ", "-"))
    });

    return { calls, service };
}

describe("TemplateConversionService", () => {
    it("converts an owned stopped VM to a private template and updates ownership", async () => {
        const { service, calls } = makeService();

        await expect(service.convertVMToTemplate({
            user: makeUser(),
            body: makeBody()
        })).resolves.toEqual({
            code: 200,
            message: "VM successfully converted to template",
            body: "new-template-1"
        });

        expect(calls).toContainEqual({
            method: "convertVMToTemplate",
            args: ["pve-a", "110", "converted-lab"]
        });
        expect(calls).toContainEqual({
            method: "waitForTaskCompletion",
            args: ["pve-a", "UPID:convert", "VM to template conversion"]
        });
        expect(calls).toContainEqual({
            method: "moveVMToTemplate",
            args: [userId, vmId, "new-template-1"]
        });
        expect(calls).toContainEqual({
            method: "deleteVM",
            args: [vmId]
        });
        const createCall = calls.find((call) => call.method === "createTemplate");
        expect(createCall?.args[0]).toMatchObject({
            description: "Converted template",
            pve_vmid: "110",
            pve_node: "pve-a",
            owner: userId,
            ciuser: "student",
            cipassword: "secret",
            is_public: false
        });
    });

    it("validates required fields before external lookups", async () => {
        const { service, calls } = makeService();

        await expect(service.convertVMToTemplate({
            user: makeUser(),
            body: makeBody({ vm_id: undefined })
        })).resolves.toMatchObject({
            code: 400,
            message: "Missing required fields: vm_id, ciuser, cipassword, description"
        });

        expect(calls).toEqual([]);
    });

    it("returns CI validation failures before loading the VM", async () => {
        const { service, calls } = makeService({
            validateResult: { code: 400, message: "bad ci" }
        });

        await expect(service.convertVMToTemplate({
            user: makeUser(),
            body: makeBody()
        })).resolves.toMatchObject({
            code: 400,
            message: "CI validation failed: bad ci"
        });

        expect(calls.map((call) => call.method)).not.toContain("findByIdAndOwner");
    });

    it("blocks conversion when the VM is missing or not owned by the actor", async () => {
        const { service } = makeService({ ownedVM: null });

        await expect(service.convertVMToTemplate({
            user: makeUser(),
            body: makeBody()
        })).resolves.toMatchObject({
            code: 404,
            message: "VM not found or you don't have permission to convert this VM"
        });
    });

    it("blocks conversion from another owner's private source template", async () => {
        const { service, calls } = makeService({
            ownedVM: makeOwnedVM({ fromTemplateId: sourceTemplateId }),
            sourceTemplate: { _id: sourceTemplateId, owner: "507f1f77bcf86cd799439014", is_public: false }
        });

        await expect(service.convertVMToTemplate({
            user: makeUser(),
            body: makeBody()
        })).resolves.toMatchObject({
            code: 403,
            message: "Cannot convert VM to template: source template is private"
        });

        expect(calls.map((call) => call.method)).not.toContain("getVMStatus");
    });

    it("requires the VM to be stopped before conversion", async () => {
        const { service } = makeService({
            status: { status: "running" }
        });

        await expect(service.convertVMToTemplate({
            user: makeUser(),
            body: makeBody()
        })).resolves.toMatchObject({
            code: 400,
            message: "VM must be stopped before converting to template"
        });
    });

    it("rejects invalid optional template names", async () => {
        const { service } = makeService({
            sanitizeVMName: () => ""
        });

        await expect(service.convertVMToTemplate({
            user: makeUser(),
            body: makeBody()
        })).resolves.toMatchObject({
            code: 400,
            message: "Invalid template name: name contains invalid characters or is too long"
        });
    });

    it("returns PVE conversion failures without creating records", async () => {
        const { service, calls } = makeService({
            convertResult: { success: false, errorMessage: "cannot convert" }
        });

        await expect(service.convertVMToTemplate({
            user: makeUser(),
            body: makeBody()
        })).resolves.toMatchObject({
            code: 500,
            message: "Failed to convert VM to template: cannot convert"
        });

        expect(calls.map((call) => call.method)).not.toContain("createTemplate");
    });

    it("returns conversion task wait failures without creating records", async () => {
        const { service, calls } = makeService({
            waitResult: { success: false, errorMessage: "task failed" }
        });

        await expect(service.convertVMToTemplate({
            user: makeUser(),
            body: makeBody()
        })).resolves.toMatchObject({
            code: 500,
            message: "Template conversion failed: task failed"
        });

        expect(calls.map((call) => call.method)).not.toContain("createTemplate");
    });
});
