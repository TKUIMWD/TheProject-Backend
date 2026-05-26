import { SubmittedBoxStatus } from "../../interfaces/SubmittedBox";
import { sanitizeString } from "../../utils/sanitize";
import { validateObjectIdInput } from "../common/ObjectIdPolicy";

export function validateVMBoxSubmissionAuditRequest(
    value: { submission_id?: unknown; status?: unknown; reject_reason?: unknown }
): { valid: true; submissionId: string; status: SubmittedBoxStatus.approved | SubmittedBoxStatus.rejected; rejectReason?: string } | { valid: false; message: string } {
    if (!value.submission_id || !value.status) {
        return { valid: false, message: "Missing required fields: submission_id, status" };
    }

    const submissionIdResult = validateObjectIdInput(value.submission_id, "submission_id");
    if (!submissionIdResult.valid) {
        return { valid: false, message: "Invalid submission_id format" };
    }

    if (![SubmittedBoxStatus.approved, SubmittedBoxStatus.rejected].includes(value.status as SubmittedBoxStatus)) {
        return { valid: false, message: "Invalid status. Must be 'approved' or 'rejected'." };
    }

    const rejectReason = typeof value.reject_reason === "string"
        ? sanitizeString(value.reject_reason).trim()
        : "";

    return {
        valid: true,
        submissionId: submissionIdResult.value,
        status: value.status as SubmittedBoxStatus.approved | SubmittedBoxStatus.rejected,
        rejectReason: rejectReason || undefined
    };
}

export function buildVMBoxSubmissionAuditUpdate(
    status: SubmittedBoxStatus.approved | SubmittedBoxStatus.rejected,
    rejectReason: string | undefined,
    now: Date = new Date()
): {
    status: SubmittedBoxStatus.approved | SubmittedBoxStatus.rejected;
    status_updated_date: Date;
    reject_reason?: string;
} {
    return {
        status,
        status_updated_date: now,
        reject_reason: status === SubmittedBoxStatus.rejected
            ? rejectReason || "No reason provided"
            : undefined
    };
}

export function buildApprovedVMBoxPayload(submittedBox: any, now: Date = new Date()): Record<string, unknown> {
    return {
        vmtemplate_id: submittedBox.vmtemplate_id,
        box_setup_description: submittedBox.box_setup_description,
        submitter_user_id: submittedBox.submitter_user_id,
        submitted_date: submittedBox.submitted_date,
        is_public: true,
        rating_score: undefined,
        review_count: undefined,
        reviews: [],
        walkthroughs: [],
        updated_date: now,
        flag_answers: submittedBox.flag_answers,
        allow_ai_assistant: submittedBox.allow_ai_assistant !== false,
        design_md: submittedBox.design_md,
        setup_md: submittedBox.setup_md,
        writeup_md: submittedBox.writeup_md,
        submitted_box_id: submittedBox._id?.toString()
    };
}

export function buildVMBoxAuditEmailPayload(input: {
    status: SubmittedBoxStatus.approved | SubmittedBoxStatus.rejected;
    rejectReason?: string;
    templateName?: string;
}): { templateName: string; status: "approved" | "rejected"; message: string } {
    if (input.status === SubmittedBoxStatus.approved) {
        return {
            templateName: input.templateName || "unknown",
            status: "approved",
            message: "Your box submission has been approved and is now public."
        };
    }

    return {
        templateName: input.templateName || "unknown",
        status: "rejected",
        message: input.rejectReason || "No reason provided"
    };
}
