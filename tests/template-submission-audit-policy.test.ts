import { describe, expect, it } from "vitest";
import { SubmittedTemplateStatus } from "../src/interfaces/SubmittedTemplate";
import { validateTemplateSubmissionAuditRequest } from "../src/modules/templates/TemplateSubmissionAuditPolicy";

const templateId = "507f1f77bcf86cd799439011";

describe("validateTemplateSubmissionAuditRequest", () => {
    it("validates approved audit requests", () => {
        expect(validateTemplateSubmissionAuditRequest({
            template_id: ` ${templateId} `,
            status: SubmittedTemplateStatus.approved
        })).toEqual({
            valid: true,
            submittedTemplateId: templateId,
            status: SubmittedTemplateStatus.approved
        });
    });

    it("validates and sanitizes rejected audit requests", () => {
        expect(validateTemplateSubmissionAuditRequest({
            template_id: templateId,
            status: SubmittedTemplateStatus.rejected,
            reject_reason: "<script>bad()</script> missing hardening notes "
        })).toEqual({
            valid: true,
            submittedTemplateId: templateId,
            status: SubmittedTemplateStatus.rejected,
            rejectReason: "missing hardening notes"
        });
    });

    it("rejects missing required fields", () => {
        expect(validateTemplateSubmissionAuditRequest({
            template_id: templateId
        })).toEqual({
            valid: false,
            message: "Missing required fields: template_id, status"
        });
    });

    it("rejects invalid IDs and statuses", () => {
        expect(validateTemplateSubmissionAuditRequest({
            template_id: "bad-id",
            status: SubmittedTemplateStatus.approved
        })).toEqual({
            valid: false,
            message: "Invalid template_id format"
        });

        expect(validateTemplateSubmissionAuditRequest({
            template_id: templateId,
            status: SubmittedTemplateStatus.not_approved
        })).toEqual({
            valid: false,
            message: "Invalid status. Must be 'approved' or 'rejected'."
        });
    });
});
