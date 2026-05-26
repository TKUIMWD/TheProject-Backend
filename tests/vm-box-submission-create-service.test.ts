import { describe, expect, it } from "vitest";
import { SubmittedBoxStatus } from "../src/interfaces/SubmittedBox";
import { VMBoxSubmissionCreateService } from "../src/modules/vm-box/VMBoxSubmissionCreateService";

const templateId = "507f1f77bcf86cd799439011";
const userId = "507f1f77bcf86cd799439012";
const submittedDate = new Date("2026-05-26T01:02:03.000Z");

function makeUser() {
    return {
        _id: userId,
        username: "admin",
        email: "admin@example.com",
        role: "admin",
        course_ids: [],
        owned_vms: [],
        owned_templates: [],
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
    const service = new VMBoxSubmissionCreateService({
        templateRepo: {
            findById: async (id) => {
                calls.push({ method: "findTemplateById", args: [id] });
                return options.template === undefined ? { _id: id } : options.template;
            }
        },
        submissionRepo: {
            createSubmissionDocument: (payload) => {
                calls.push({ method: "createSubmissionDocument", args: [payload] });
                return {
                    _id: "submission-1",
                    submitted_date: submittedDate,
                    save: async () => {
                        calls.push({ method: "saveSubmission", args: [] });
                    }
                };
            }
        }
    });

    return { calls, service };
}

describe("VMBoxSubmissionCreateService", () => {
    it("creates a submitted box for an existing template", async () => {
        const { service, calls } = makeService();

        await expect(service.submitBox({
            user: makeUser(),
            request: {
                vmtemplate_id: templateId,
                box_setup_description: "Privilege escalation box",
                flag_answers: { user: "flag{user}" },
                allow_ai_assistant: false,
                design_md: "Design",
                setup_md: "Setup",
                writeup_md: "Writeup"
            }
        })).resolves.toEqual({
            code: 200,
            message: "Box submission created successfully, waiting for approval",
            body: {
                submission_id: "submission-1",
                vmtemplate_id: templateId,
                submitted_date: submittedDate,
                submitter: "admin@example.com"
            }
        });

        expect(calls).toContainEqual({ method: "findTemplateById", args: [templateId] });
        expect(calls).toContainEqual({ method: "saveSubmission", args: [] });
        const createCall = calls.find((call) => call.method === "createSubmissionDocument");
        expect(createCall?.args[0]).toMatchObject({
            vmtemplate_id: templateId,
            box_setup_description: "Privilege escalation box",
            submitter_user_id: userId,
            status: SubmittedBoxStatus.not_approved,
            flag_answers: { user: "flag{user}" },
            allow_ai_assistant: false
        });
    });

    it("returns validation errors before template lookup", async () => {
        const { service, calls } = makeService();

        await expect(service.submitBox({
            user: makeUser(),
            request: {
                vmtemplate_id: "bad-id",
                box_setup_description: "Box"
            }
        })).resolves.toMatchObject({
            code: 400,
            message: "Invalid vmtemplate_id format"
        });

        expect(calls).toEqual([]);
    });

    it("returns missing template errors without saving a submission", async () => {
        const { service, calls } = makeService({ template: null });

        await expect(service.submitBox({
            user: makeUser(),
            request: {
                vmtemplate_id: templateId,
                box_setup_description: "Box"
            }
        })).resolves.toMatchObject({
            code: 404,
            message: "Template not found"
        });

        expect(calls.some((call) => call.method === "createSubmissionDocument")).toBe(false);
    });
});
