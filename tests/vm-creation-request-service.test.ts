import { describe, expect, it } from "vitest";
import Roles from "../src/enum/role";
import { VMCreationRequestService } from "../src/modules/vm/VMCreationRequestService";

const userId = "507f1f77bcf86cd799439801";
const templateId = "507f1f77bcf86cd799439802";
const boxId = "507f1f77bcf86cd799439803";

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
        owned_vms: [],
        owned_templates: [],
        ...overrides
    } as any;
}

function makeBody(overrides: Record<string, unknown> = {}) {
    return {
        template_id: templateId,
        name: "Blue Lab",
        target: "pve-a",
        storage: "NFS",
        full: "1",
        cpuCores: 2,
        memorySize: 2048,
        diskSize: 20,
        ...overrides
    };
}

function makeTemplate(overrides: Record<string, unknown> = {}) {
    return {
        _id: templateId,
        description: "Ubuntu template",
        pve_node: "pve-template",
        pve_vmid: "9000",
        owner: userId,
        ciuser: "student",
        cipassword: "secret",
        is_public: true,
        ...overrides
    };
}

function makeService(options: {
    template?: any | null;
    box?: any | null;
    validationResp?: any;
    nextIdResp?: any;
    templateInfoResp?: any;
    resourceResp?: any;
    workflowResp?: any;
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const service = new VMCreationRequestService({
        sources: {
            findTemplateById: async (...args) => {
                calls.push({ method: "findTemplateById", args });
                return options.template === undefined ? makeTemplate() : options.template;
            },
            findBoxById: async (...args) => {
                calls.push({ method: "findBoxById", args });
                return options.box === undefined
                    ? { _id: { toString: () => boxId }, vmtemplate_id: templateId }
                    : options.box;
            }
        },
        vmUtils: {
            validateVMCreationParams: async (...args) => {
                calls.push({ method: "validateVMCreationParams", args });
                return options.validationResp ?? { code: 200, message: "ok", body: undefined };
            },
            getNextVMId: async (...args) => {
                calls.push({ method: "getNextVMId", args });
                return options.nextIdResp ?? { code: 200, message: "ok", body: { data: "101" } };
            },
            getTemplateInfo: async (...args) => {
                calls.push({ method: "getTemplateInfo", args });
                return options.templateInfoResp ?? {
                    code: 200,
                    message: "ok",
                    body: { vmid: 9000, name: "template" }
                };
            }
        },
        resourceAccounting: {
            checkCreateLimits: async (...args) => {
                calls.push({ method: "checkCreateLimits", args });
                return options.resourceResp ?? { code: 200, message: "ok", body: undefined };
            }
        },
        workflow: {
            cloneConfigureAndRegisterVM: async (...args) => {
                calls.push({ method: "cloneConfigureAndRegisterVM", args });
                return options.workflowResp ?? {
                    code: 200,
                    message: "VM created successfully",
                    body: { vmid: "101" }
                };
            }
        }
    });

    return { calls, service };
}

describe("VMCreationRequestService", () => {
    it("rejects invalid template IDs before VM validation", async () => {
        const { service, calls } = makeService();

        await expect(service.createFromTemplate({
            user: makeUser(),
            body: makeBody({ template_id: "not-an-id" })
        })).resolves.toEqual({
            code: 400,
            message: "Invalid template_id format",
            body: undefined
        });

        expect(calls).toEqual([]);
    });

    it("returns VM creation validation failures before next-id lookup", async () => {
        const { service, calls } = makeService({
            validationResp: { code: 400, message: "Invalid VM name", body: undefined }
        });

        await expect(service.createFromTemplate({
            user: makeUser(),
            body: makeBody()
        })).resolves.toEqual({
            code: 400,
            message: "Invalid VM name",
            body: undefined
        });

        expect(calls.map((call) => call.method)).toEqual(["validateVMCreationParams"]);
    });

    it("returns template lookup failures before resource checks", async () => {
        const { service, calls } = makeService({ template: null });

        await expect(service.createFromTemplate({
            user: makeUser(),
            body: makeBody()
        })).resolves.toEqual({
            code: 404,
            message: "Template not found",
            body: undefined
        });

        expect(calls.map((call) => call.method)).toEqual([
            "validateVMCreationParams",
            "getNextVMId",
            "findTemplateById"
        ]);
    });

    it("returns resource-limit failures before workflow execution", async () => {
        const { service, calls } = makeService({
            resourceResp: { code: 403, message: "Resource limit exceeded", body: undefined }
        });

        await expect(service.createFromTemplate({
            user: makeUser(),
            body: makeBody()
        })).resolves.toEqual({
            code: 403,
            message: "Resource limit exceeded",
            body: undefined
        });

        expect(calls.map((call) => call.method)).not.toContain("cloneConfigureAndRegisterVM");
    });

    it("creates a VM from a template with request Cloud-Init credentials overriding template defaults", async () => {
        const { service, calls } = makeService();

        await expect(service.createFromTemplate({
            user: makeUser(),
            body: makeBody({
                ciuser: "override-user",
                cipassword: "override-pass"
            })
        })).resolves.toMatchObject({
            code: 200,
            body: { vmid: "101" }
        });

        const workflowInput = calls.find((call) => call.method === "cloneConfigureAndRegisterVM")!.args[0] as any;
        expect(workflowInput).toMatchObject({
            templateId,
            nextId: "101",
            sanitizedName: "blue-lab",
            target: "pve-a",
            storage: "NFS",
            full: "1",
            cpuCores: 2,
            memorySize: 2048,
            diskSize: 20,
            ciuser: "override-user",
            cipassword: "override-pass"
        });
    });

    it("rejects invalid box IDs before box lookup", async () => {
        const { service, calls } = makeService();

        await expect(service.createFromBoxTemplate({
            user: makeUser(),
            body: {
                ...makeBody(),
                box_id: "bad-id"
            }
        })).resolves.toEqual({
            code: 400,
            message: "Invalid box_id format",
            body: undefined
        });

        expect(calls).toEqual([]);
    });

    it("returns not found when the source box does not exist", async () => {
        const { service, calls } = makeService({ box: null });

        await expect(service.createFromBoxTemplate({
            user: makeUser(),
            body: {
                ...makeBody(),
                box_id: boxId
            }
        })).resolves.toEqual({
            code: 404,
            message: "Box not found",
            body: undefined
        });

        expect(calls).toEqual([{ method: "findBoxById", args: [boxId] }]);
    });

    it("creates a box VM and passes the published box ID to the workflow", async () => {
        const { service, calls } = makeService();

        await expect(service.createFromBoxTemplate({
            user: makeUser(),
            body: {
                ...makeBody(),
                box_id: boxId
            }
        })).resolves.toMatchObject({
            code: 200
        });

        const validationInput = calls.find((call) => call.method === "validateVMCreationParams")!.args[0] as any;
        expect(validationInput.template_id).toBe(templateId);

        const workflowInput = calls.find((call) => call.method === "cloneConfigureAndRegisterVM")!.args[0] as any;
        expect(workflowInput).toMatchObject({
            templateId,
            boxId,
            sanitizedName: "blue-lab"
        });
        expect(workflowInput.ciuser).toBeUndefined();
        expect(workflowInput.cipassword).toBeUndefined();
    });
});
