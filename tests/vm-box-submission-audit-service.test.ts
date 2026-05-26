import { describe, expect, it } from "vitest";
import { SubmittedBoxStatus } from "../src/interfaces/SubmittedBox";
import { VMBoxSubmissionAuditService } from "../src/modules/vm-box/VMBoxSubmissionAuditService";

const submissionId = "507f1f77bcf86cd799439011";
const templateId = "507f1f77bcf86cd799439012";
const submitterId = "507f1f77bcf86cd799439013";
const superAdminId = "507f1f77bcf86cd799439014";
const fixedNow = new Date("2026-05-26T10:00:00.000Z");

function makeSubmittedBox(overrides: Record<string, unknown> = {}) {
    return {
        _id: submissionId,
        status: SubmittedBoxStatus.not_approved,
        vmtemplate_id: templateId,
        box_setup_description: "Box setup",
        submitter_user_id: submitterId,
        submitted_date: new Date("2026-05-20T00:00:00.000Z"),
        flag_answers: { flag1: "answer" },
        allow_ai_assistant: true,
        design_md: "# design",
        setup_md: "# setup",
        writeup_md: "# writeup",
        save: async () => undefined,
        ...overrides
    } as any;
}

function makeTemplate(overrides: Record<string, unknown> = {}) {
    return {
        _id: templateId,
        pve_node: "pve-a",
        pve_vmid: "9000",
        ...overrides
    };
}

function makeService(options: {
    submittedBox?: any | null;
    template?: any | null;
    qemu?: any;
    emailError?: Error;
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];

    const service = new VMBoxSubmissionAuditService({
        submissionRepo: {
            findById: async (id) => {
                calls.push({ method: "findSubmissionById", args: [id] });
                return options.submittedBox === undefined ? makeSubmittedBox() : options.submittedBox;
            }
        },
        templateRepo: {
            findById: async (id) => {
                calls.push({ method: "findTemplateById", args: [id] });
                return options.template === undefined ? makeTemplate() : options.template;
            }
        },
        boxRepo: {
            createBoxDocument: (payload) => {
                calls.push({ method: "createBoxDocument", args: [payload] });
                return {
                    _id: "box-1",
                    save: async () => {
                        calls.push({ method: "saveBox", args: [] });
                    }
                };
            }
        },
        userRepo: {
            findById: async (id) => {
                calls.push({ method: "findUserById", args: [id] });
                return { email: `${id}@example.com` };
            }
        },
        vmUtils: {
            getBasicQemuConfig: async (node, vmid) => {
                calls.push({ method: "getBasicQemuConfig", args: [node, vmid] });
                return options.qemu ?? { code: 200, message: "ok", body: { name: "Template A" } };
            }
        },
        sendAuditResultEmail: async (...args) => {
            calls.push({ method: "sendAuditResultEmail", args });
            if (options.emailError) throw options.emailError;
        },
        now: () => fixedNow
    });

    return { calls, service };
}

describe("VMBoxSubmissionAuditService", () => {
    it("approves a submitted box, creates a public VM box, and sends notification", async () => {
        const submittedBox = makeSubmittedBox();
        const { service, calls } = makeService({ submittedBox });

        await expect(service.auditBoxSubmission({
            user: { _id: superAdminId, email: "root@example.com" } as any,
            body: { submission_id: submissionId, status: SubmittedBoxStatus.approved }
        })).resolves.toMatchObject({
            code: 200,
            body: submissionId
        });

        expect(submittedBox.status).toBe(SubmittedBoxStatus.approved);
        expect(submittedBox.status_updated_date).toEqual(fixedNow);
        expect(submittedBox.reject_reason).toBeUndefined();
        const createCall = calls.find((call) => call.method === "createBoxDocument");
        expect(createCall?.args[0]).toMatchObject({
            vmtemplate_id: templateId,
            box_setup_description: "Box setup",
            submitter_user_id: submitterId,
            is_public: true,
            updated_date: fixedNow,
            submitted_box_id: submissionId
        });
        expect(calls).toContainEqual({ method: "saveBox", args: [] });
        expect(calls).toContainEqual({
            method: "sendAuditResultEmail",
            args: [`${submitterId}@example.com`, "Template A", "approved", "Your box submission has been approved and is now public."]
        });
    });

    it("rejects a submitted box and sends the rejection reason", async () => {
        const submittedBox = makeSubmittedBox();
        const { service, calls } = makeService({ submittedBox });

        await expect(service.auditBoxSubmission({
            user: { _id: superAdminId, email: "root@example.com" } as any,
            body: {
                submission_id: submissionId,
                status: SubmittedBoxStatus.rejected,
                reject_reason: "Need clearer flags"
            }
        })).resolves.toMatchObject({
            code: 200
        });

        expect(submittedBox.status).toBe(SubmittedBoxStatus.rejected);
        expect(submittedBox.reject_reason).toBe("Need clearer flags");
        expect(calls.some((call) => call.method === "createBoxDocument")).toBe(false);
        expect(calls).toContainEqual({
            method: "sendAuditResultEmail",
            args: [`${submitterId}@example.com`, "Template A", "rejected", "Need clearer flags"]
        });
    });

    it("keeps audit success when email notification fails", async () => {
        const { service } = makeService({ emailError: new Error("SMTP down") });

        await expect(service.auditBoxSubmission({
            user: { _id: superAdminId, email: "root@example.com" } as any,
            body: { submission_id: submissionId, status: SubmittedBoxStatus.approved }
        })).resolves.toMatchObject({
            code: 200
        });
    });

    it("returns validation errors before repository calls", async () => {
        const { service, calls } = makeService();

        await expect(service.auditBoxSubmission({
            user: { _id: superAdminId } as any,
            body: { submission_id: "bad-id", status: SubmittedBoxStatus.approved }
        })).resolves.toMatchObject({
            code: 400,
            message: "Invalid submission_id format"
        });

        expect(calls).toEqual([]);
    });

    it("returns missing template errors without creating a published box", async () => {
        const { service, calls } = makeService({ template: null });

        await expect(service.auditBoxSubmission({
            user: { _id: superAdminId } as any,
            body: { submission_id: submissionId, status: SubmittedBoxStatus.approved }
        })).resolves.toMatchObject({
            code: 404,
            message: "Template not found for the submitted box"
        });

        expect(calls.some((call) => call.method === "createBoxDocument")).toBe(false);
    });
});
