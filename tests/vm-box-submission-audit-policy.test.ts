import { describe, expect, it } from "vitest";
import { SubmittedBoxStatus } from "../src/interfaces/SubmittedBox";
import {
    buildApprovedVMBoxPayload,
    buildVMBoxAuditEmailPayload,
    buildVMBoxSubmissionAuditUpdate,
    validateVMBoxSubmissionAuditRequest
} from "../src/modules/vm-box/VMBoxSubmissionAuditPolicy";

const submissionId = "507f1f77bcf86cd799439011";

describe("validateVMBoxSubmissionAuditRequest", () => {
    it("validates approved audit requests", () => {
        expect(validateVMBoxSubmissionAuditRequest({
            submission_id: ` ${submissionId} `,
            status: SubmittedBoxStatus.approved
        })).toEqual({
            valid: true,
            submissionId,
            status: SubmittedBoxStatus.approved
        });
    });

    it("validates and sanitizes rejected audit requests", () => {
        expect(validateVMBoxSubmissionAuditRequest({
            submission_id: submissionId,
            status: SubmittedBoxStatus.rejected,
            reject_reason: "<script>bad()</script> not enough setup detail "
        })).toEqual({
            valid: true,
            submissionId,
            status: SubmittedBoxStatus.rejected,
            rejectReason: "not enough setup detail"
        });
    });

    it("rejects missing required fields", () => {
        expect(validateVMBoxSubmissionAuditRequest({
            submission_id: submissionId
        })).toEqual({
            valid: false,
            message: "Missing required fields: submission_id, status"
        });
    });

    it("rejects invalid submission IDs and statuses", () => {
        expect(validateVMBoxSubmissionAuditRequest({
            submission_id: "bad-id",
            status: SubmittedBoxStatus.approved
        })).toEqual({
            valid: false,
            message: "Invalid submission_id format"
        });

        expect(validateVMBoxSubmissionAuditRequest({
            submission_id: submissionId,
            status: SubmittedBoxStatus.not_approved
        })).toEqual({
            valid: false,
            message: "Invalid status. Must be 'approved' or 'rejected'."
        });
    });

    it("builds submission audit updates", () => {
        const now = new Date("2026-05-26T00:00:00.000Z");

        expect(buildVMBoxSubmissionAuditUpdate(SubmittedBoxStatus.approved, "ignored", now)).toEqual({
            status: SubmittedBoxStatus.approved,
            status_updated_date: now,
            reject_reason: undefined
        });

        expect(buildVMBoxSubmissionAuditUpdate(SubmittedBoxStatus.rejected, undefined, now)).toEqual({
            status: SubmittedBoxStatus.rejected,
            status_updated_date: now,
            reject_reason: "No reason provided"
        });
    });

    it("builds approved VMBox creation payloads from submitted boxes", () => {
        const now = new Date("2026-05-26T00:00:00.000Z");
        const submittedDate = new Date("2026-05-25T00:00:00.000Z");

        expect(buildApprovedVMBoxPayload({
            _id: { toString: () => "submission-1" },
            vmtemplate_id: "template-1",
            box_setup_description: "Box setup",
            submitter_user_id: "user-1",
            submitted_date: submittedDate,
            flag_answers: [{ id: "flag-1", answer: "flag" }],
            allow_ai_assistant: false,
            design_md: "# design",
            setup_md: "# setup",
            writeup_md: "# writeup"
        }, now)).toEqual({
            vmtemplate_id: "template-1",
            box_setup_description: "Box setup",
            submitter_user_id: "user-1",
            submitted_date: submittedDate,
            is_public: true,
            rating_score: undefined,
            review_count: undefined,
            reviews: [],
            walkthroughs: [],
            updated_date: now,
            flag_answers: [{ id: "flag-1", answer: "flag" }],
            allow_ai_assistant: false,
            design_md: "# design",
            setup_md: "# setup",
            writeup_md: "# writeup",
            submitted_box_id: "submission-1"
        });
    });

    it("builds stable audit notification email payloads", () => {
        expect(buildVMBoxAuditEmailPayload({
            status: SubmittedBoxStatus.approved,
            templateName: "Template A"
        })).toEqual({
            templateName: "Template A",
            status: "approved",
            message: "Your box submission has been approved and is now public."
        });

        expect(buildVMBoxAuditEmailPayload({
            status: SubmittedBoxStatus.rejected,
            rejectReason: "Needs flags"
        })).toEqual({
            templateName: "unknown",
            status: "rejected",
            message: "Needs flags"
        });
    });
});
