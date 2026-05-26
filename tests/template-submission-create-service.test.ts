import { describe, expect, it } from "vitest";
import { SubmittedTemplateStatus } from "../src/interfaces/SubmittedTemplate";
import { TemplateSubmissionCreateService } from "../src/modules/templates/TemplateSubmissionCreateService";

const userId = "507f1f77bcf86cd799439021";
const templateId = "507f1f77bcf86cd799439022";
const fixedNow = new Date("2026-05-26T12:00:00.000Z");

function makeUser() {
    return {
        _id: userId,
        username: "teacher",
        email: "teacher@example.test",
        role: "admin",
        course_ids: [],
        owned_vms: [],
        owned_templates: [templateId],
        password_hash: "",
        isVerified: true,
        compute_resource_plan_id: "",
        used_compute_resource_id: ""
    } as any;
}

function makeService(options: {
    template?: any | null;
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const service = new TemplateSubmissionCreateService({
        templateRepo: {
            findById: async (...args) => {
                calls.push({ method: "findTemplateById", args });
                return options.template === undefined ? { _id: templateId } : options.template;
            }
        },
        submittedTemplateRepo: {
            create: async (payload) => {
                calls.push({ method: "createSubmittedTemplate", args: [payload] });
                return { _id: "submitted-template-1" };
            }
        },
        now: () => fixedNow
    });

    return { calls, service };
}

describe("TemplateSubmissionCreateService", () => {
    it("creates a pending submitted-template record for an existing template", async () => {
        const { service, calls } = makeService();

        await expect(service.submitTemplate({
            user: makeUser(),
            body: { template_id: templateId }
        })).resolves.toEqual({
            code: 200,
            message: "Template submitted successfully",
            body: templateId
        });

        expect(calls).toContainEqual({
            method: "findTemplateById",
            args: [templateId]
        });
        expect(calls).toContainEqual({
            method: "createSubmittedTemplate",
            args: [{
                status: SubmittedTemplateStatus.not_approved,
                template_id: templateId,
                submitter_user_id: userId,
                submitted_date: fixedNow
            }]
        });
    });

    it("rejects invalid template IDs before repository lookup", async () => {
        const { service, calls } = makeService();

        await expect(service.submitTemplate({
            user: makeUser(),
            body: { template_id: "bad-id" }
        })).resolves.toMatchObject({
            code: 400,
            message: "Invalid template_id format"
        });

        expect(calls).toEqual([]);
    });

    it("returns not found when the template does not exist", async () => {
        const { service, calls } = makeService({ template: null });

        await expect(service.submitTemplate({
            user: makeUser(),
            body: { template_id: templateId }
        })).resolves.toMatchObject({
            code: 404,
            message: "Template not found"
        });

        expect(calls.map((call) => call.method)).not.toContain("createSubmittedTemplate");
    });
});
