import { describe, expect, it } from "vitest";
import { SubmittedTemplateStatus } from "../src/interfaces/SubmittedTemplate";
import { TemplateAuditService } from "../src/modules/templates/TemplateAuditService";

const submittedTemplateId = "507f1f77bcf86cd7994390d1";
const templateId = "507f1f77bcf86cd7994390d2";
const superAdminId = "507f1f77bcf86cd7994390d3";
const submitterId = "507f1f77bcf86cd7994390d4";
const fixedNow = new Date("2026-05-26T10:00:00.000Z");

function makeSubmittedTemplate(overrides: Record<string, unknown> = {}) {
    return {
        _id: submittedTemplateId,
        status: SubmittedTemplateStatus.not_approved,
        template_id: templateId,
        submitter_user_id: submitterId,
        submitted_date: new Date("2026-05-20T00:00:00.000Z"),
        save: async () => undefined,
        ...overrides
    } as any;
}

function makeTemplate(overrides: Record<string, unknown> = {}) {
    return {
        _id: templateId,
        description: "Ubuntu template",
        pve_vmid: "9000",
        pve_node: "pve-a",
        owner: submitterId,
        ciuser: "student",
        cipassword: "password",
        ...overrides
    } as any;
}

function makeService(options: {
    submittedTemplate?: any | null;
    template?: any | null;
    basicQemu?: any;
    nextId?: any;
    templateInfo?: any;
    cloneResult?: { success: boolean; upid?: string; errorMessage?: string };
    waitResult?: { success: boolean; errorMessage?: string };
    verifyTemplateInfo?: any;
    sanitizeVMName?: (name: string) => string | null;
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    let getTemplateInfoCallCount = 0;

    const service = new TemplateAuditService({
        submittedTemplateRepo: {
            findById: async (id) => {
                calls.push({ method: "findSubmittedTemplateById", args: [id] });
                return options.submittedTemplate === undefined ? makeSubmittedTemplate() : options.submittedTemplate;
            }
        },
        templateRepo: {
            findById: async (id) => {
                calls.push({ method: "findTemplateById", args: [id] });
                return options.template === undefined ? makeTemplate() : options.template;
            },
            createApprovedTemplate: async (payload) => {
                calls.push({ method: "createApprovedTemplate", args: [payload] });
                return { _id: "approved-template-1" };
            }
        },
        userRepo: {
            findById: async (id) => {
                calls.push({ method: "findUserById", args: [id] });
                return { email: `${id}@example.com` };
            },
            addOwnedTemplate: async (id, approvedTemplateId) => {
                calls.push({ method: "addOwnedTemplate", args: [id, approvedTemplateId] });
            }
        },
        vmUtils: {
            getBasicQemuConfig: async (node, vmid) => {
                calls.push({ method: "getBasicQemuConfig", args: [node, vmid] });
                return options.basicQemu ?? { code: 200, message: "ok", body: { name: "Submitted Ubuntu" } };
            },
            getNextVMId: async () => {
                calls.push({ method: "getNextVMId", args: [] });
                return options.nextId ?? { code: 200, message: "ok", body: { data: "9100" } };
            },
            getTemplateInfo: async (node, vmid) => {
                calls.push({ method: "getTemplateInfo", args: [node, vmid] });
                getTemplateInfoCallCount += 1;
                if (getTemplateInfoCallCount > 1 && options.verifyTemplateInfo !== undefined) {
                    return options.verifyTemplateInfo;
                }
                return options.templateInfo ?? { code: 200, message: "ok", body: { name: "Base Ubuntu" } };
            },
            cloneVM: async (...args) => {
                calls.push({ method: "cloneVM", args });
                return options.cloneResult ?? { success: true, upid: "UPID:clone" };
            },
            waitForTaskCompletion: async (node, upid, label) => {
                calls.push({ method: "waitForTaskCompletion", args: [node, upid, label] });
                return options.waitResult ?? { success: true };
            }
        },
        sanitizeVMName: options.sanitizeVMName ?? ((name) => name.toLowerCase().replaceAll(" ", "-")),
        sendAuditResultEmail: (toMail, templateName, status, rejectReason) => {
            calls.push({ method: "sendAuditResultEmail", args: [toMail, templateName, status, rejectReason] });
        },
        now: () => fixedNow,
        sleep: async (milliseconds) => {
            calls.push({ method: "sleep", args: [milliseconds] });
        }
    });

    return { calls, service };
}

describe("TemplateAuditService", () => {
    it("approves a submitted template by cloning it and creating a public template", async () => {
        const submittedTemplate = makeSubmittedTemplate();
        const { service, calls } = makeService({ submittedTemplate });

        await expect(service.auditSubmittedTemplate({
            user: { _id: superAdminId } as any,
            body: { template_id: submittedTemplateId, status: SubmittedTemplateStatus.approved }
        })).resolves.toMatchObject({
            code: 200,
            body: submittedTemplateId
        });

        expect(submittedTemplate.status).toBe(SubmittedTemplateStatus.approved);
        expect(submittedTemplate.status_updated_date).toEqual(fixedNow);
        expect(submittedTemplate.reject_reason).toBeUndefined();
        expect(calls).toContainEqual({
            method: "cloneVM",
            args: ["pve-a", "9000", "9100", "2026-05-26-base-ubuntu", "pve-a", "NFS", "1"]
        });
        expect(calls).toContainEqual({
            method: "addOwnedTemplate",
            args: [superAdminId, "approved-template-1"]
        });
        expect(calls).toContainEqual({
            method: "sendAuditResultEmail",
            args: [`${submitterId}@example.com`, "Submitted Ubuntu", "approved", undefined]
        });
        const createCall = calls.find((call) => call.method === "createApprovedTemplate");
        expect(createCall?.args[0]).toMatchObject({
            description: "[Approved] Ubuntu template",
            pve_vmid: "9100",
            pve_node: "pve-a",
            submitter_user_id: submitterId,
            owner: superAdminId,
            is_public: true
        });
    });

    it("rejects a submitted template and stores a fallback reason", async () => {
        const submittedTemplate = makeSubmittedTemplate();
        const { service, calls } = makeService({ submittedTemplate });

        await expect(service.auditSubmittedTemplate({
            user: { _id: superAdminId } as any,
            body: { template_id: submittedTemplateId, status: SubmittedTemplateStatus.rejected }
        })).resolves.toMatchObject({
            code: 200
        });

        expect(submittedTemplate.status).toBe(SubmittedTemplateStatus.rejected);
        expect(submittedTemplate.reject_reason).toBe("No reason provided");
        expect(calls.some((call) => call.method === "cloneVM")).toBe(false);
        expect(calls).toContainEqual({
            method: "sendAuditResultEmail",
            args: [`${submitterId}@example.com`, "Submitted Ubuntu", "rejected", "No reason provided"]
        });
    });

    it("returns validation errors before loading the submission", async () => {
        const { service, calls } = makeService();

        await expect(service.auditSubmittedTemplate({
            user: { _id: superAdminId } as any,
            body: { template_id: "bad-id", status: SubmittedTemplateStatus.approved }
        })).resolves.toMatchObject({
            code: 400,
            message: "Invalid template_id format"
        });

        expect(calls).toEqual([]);
    });

    it("does not create a public template when PVE clone fails", async () => {
        const { service, calls } = makeService({
            cloneResult: { success: false, errorMessage: "locked" }
        });

        await expect(service.auditSubmittedTemplate({
            user: { _id: superAdminId } as any,
            body: { template_id: submittedTemplateId, status: SubmittedTemplateStatus.approved }
        })).resolves.toMatchObject({
            code: 500,
            message: "Failed to clone template in PVE: locked"
        });

        expect(calls.some((call) => call.method === "createApprovedTemplate")).toBe(false);
        expect(calls.some((call) => call.method === "sendAuditResultEmail")).toBe(false);
    });

    it("verifies the cloned template when PVE returns no UPID", async () => {
        const { service, calls } = makeService({
            cloneResult: { success: true },
            verifyTemplateInfo: { code: 200, message: "ok", body: { name: "Verified" } }
        });

        await expect(service.auditSubmittedTemplate({
            user: { _id: superAdminId } as any,
            body: { template_id: submittedTemplateId, status: SubmittedTemplateStatus.approved }
        })).resolves.toMatchObject({
            code: 200
        });

        expect(calls).toContainEqual({ method: "sleep", args: [3000] });
        expect(calls.filter((call) => call.method === "getTemplateInfo").map((call) => call.args)).toEqual([
            ["pve-a", "9000"],
            ["pve-a", "9100"]
        ]);
    });

    it("returns clone verification failures without creating the template record", async () => {
        const { service, calls } = makeService({
            cloneResult: { success: true },
            verifyTemplateInfo: { code: 404, message: "not found" }
        });

        await expect(service.auditSubmittedTemplate({
            user: { _id: superAdminId } as any,
            body: { template_id: submittedTemplateId, status: SubmittedTemplateStatus.approved }
        })).resolves.toMatchObject({
            code: 500,
            message: "Clone operation completed but failed to verify new template: not found"
        });

        expect(calls.some((call) => call.method === "createApprovedTemplate")).toBe(false);
    });
});
