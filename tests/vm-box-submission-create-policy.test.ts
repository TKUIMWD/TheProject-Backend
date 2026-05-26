import { describe, expect, it } from "vitest";
import {
    buildVMBoxSubmissionCreatePayload,
    buildVMBoxSubmissionCreateResponse,
    normalizeFlagAnswers,
    validateVMBoxSubmissionCreateRequest
} from "../src/modules/vm-box/VMBoxSubmissionCreatePolicy";

const templateId = "507f1f77bcf86cd799439011";

describe("VMBoxSubmissionCreatePolicy", () => {
    it("validates and sanitizes submission create requests", () => {
        expect(validateVMBoxSubmissionCreateRequest({
            vmtemplate_id: ` ${templateId} `,
            box_setup_description: " <b>Linux privilege escalation</b> ",
            flag_answers: {
                root: "flag{root}",
                ignored: 123,
                "": "skip"
            },
            allow_ai_assistant: false,
            design_md: "<script>bad()</script># Design",
            setup_md: "Setup notes",
            writeup_md: "Writeup notes"
        })).toEqual({
            valid: true,
            fields: {
                vmtemplate_id: templateId,
                box_setup_description: " <b>Linux privilege escalation</b> ",
                flag_answers: { root: "flag{root}" },
                allow_ai_assistant: false,
                design_md: "# Design",
                setup_md: "Setup notes",
                writeup_md: "Writeup notes"
            }
        });
    });

    it("keeps existing default for allow_ai_assistant", () => {
        expect(validateVMBoxSubmissionCreateRequest({
            vmtemplate_id: templateId,
            box_setup_description: "Box"
        })).toEqual({
            valid: true,
            fields: {
                vmtemplate_id: templateId,
                box_setup_description: "Box",
                flag_answers: {},
                allow_ai_assistant: true,
                design_md: "",
                setup_md: "",
                writeup_md: ""
            }
        });
    });

    it("rejects missing or invalid required fields", () => {
        expect(validateVMBoxSubmissionCreateRequest({
            vmtemplate_id: templateId
        })).toEqual({
            valid: false,
            message: "Missing required fields: vmtemplate_id, box_setup_description"
        });

        expect(validateVMBoxSubmissionCreateRequest({
            vmtemplate_id: "bad-id",
            box_setup_description: "Box"
        })).toEqual({
            valid: false,
            message: "Invalid vmtemplate_id format"
        });

        expect(validateVMBoxSubmissionCreateRequest({
            vmtemplate_id: templateId,
            box_setup_description: "<script>bad()</script>"
        })).toEqual({
            valid: false,
            message: "box_setup_description cannot be empty or strings containing security-sensitive characters"
        });
    });

    it("normalizes flag answers from maps and ignores non-string entries", () => {
        expect(normalizeFlagAnswers(new Map<string, unknown>([
            ["user", "flag{user}"],
            ["root", "flag{root}"],
            ["bad", 123]
        ]))).toEqual({
            user: "flag{user}",
            root: "flag{root}"
        });
    });

    it("builds submitted-box persistence payloads", () => {
        const submittedDate = new Date("2026-05-26T01:02:03.000Z");
        const fields = validateVMBoxSubmissionCreateRequest({
            vmtemplate_id: templateId,
            box_setup_description: "Box",
            flag_answers: { user: "flag{user}" },
            allow_ai_assistant: false,
            design_md: "Design",
            setup_md: "Setup",
            writeup_md: "Writeup"
        });
        expect(fields.valid).toBe(true);
        if (!fields.valid) return;

        expect(buildVMBoxSubmissionCreatePayload({
            fields: fields.fields,
            submitterUserId: "user-1",
            status: "not_approved",
            submittedDate
        })).toEqual({
            vmtemplate_id: templateId,
            box_setup_description: "Box",
            submitter_user_id: "user-1",
            submitted_date: submittedDate,
            status: "not_approved",
            flag_answers: { user: "flag{user}" },
            allow_ai_assistant: false,
            design_md: "Design",
            setup_md: "Setup",
            writeup_md: "Writeup"
        });
    });

    it("builds submitted-box create response payloads", () => {
        const submittedDate = new Date("2026-05-26T01:02:03.000Z");

        expect(buildVMBoxSubmissionCreateResponse({
            submissionId: "submission-1",
            vmtemplateId: templateId,
            submittedDate,
            submitterEmail: "admin@example.com"
        })).toEqual({
            submission_id: "submission-1",
            vmtemplate_id: templateId,
            submitted_date: submittedDate,
            submitter: "admin@example.com"
        });
    });
});
