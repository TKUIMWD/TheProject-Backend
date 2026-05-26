import { SubmittedTemplateStatus } from "../../interfaces/SubmittedTemplate";
import { sanitizeString } from "../../utils/sanitize";
import { validateObjectIdInput } from "../common/ObjectIdPolicy";

export function validateTemplateSubmissionAuditRequest(
    value: { template_id?: unknown; status?: unknown; reject_reason?: unknown }
): { valid: true; submittedTemplateId: string; status: SubmittedTemplateStatus.approved | SubmittedTemplateStatus.rejected; rejectReason?: string } | { valid: false; message: string } {
    if (!value.template_id || !value.status) {
        return { valid: false, message: "Missing required fields: template_id, status" };
    }

    const templateIdResult = validateObjectIdInput(value.template_id, "template_id");
    if (!templateIdResult.valid) {
        return { valid: false, message: templateIdResult.message };
    }

    if (![SubmittedTemplateStatus.approved, SubmittedTemplateStatus.rejected].includes(value.status as SubmittedTemplateStatus)) {
        return { valid: false, message: "Invalid status. Must be 'approved' or 'rejected'." };
    }

    const rejectReason = typeof value.reject_reason === "string"
        ? sanitizeString(value.reject_reason).trim()
        : "";

    return {
        valid: true,
        submittedTemplateId: templateIdResult.value,
        status: value.status as SubmittedTemplateStatus.approved | SubmittedTemplateStatus.rejected,
        rejectReason: rejectReason || undefined
    };
}
