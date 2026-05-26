import { describe, expect, it } from "vitest";
import { BoxWriteupStatus } from "../src/interfaces/BoxWriteup";
import {
    validateBoxWriteupReview,
    validateBoxWriteupSubmission,
    validateBoxWriteupSubmissionsQuery,
    validateBoxWriteupVisibility,
    validateMyBoxWriteupsQuery,
    validatePublicBoxWriteupsQuery
} from "../src/modules/vm-box/VMBoxWriteupPolicy";

const validBoxId = "507f1f77bcf86cd799439011";
const validWriteupId = "507f1f77bcf86cd799439012";
const longContent = "This writeup explains the exploitation path, validation steps, and remediation notes in detail.";

describe("VMBoxWriteupPolicy", () => {
    it("validates and sanitizes writeup submissions", () => {
        expect(validateBoxWriteupSubmission({
            box_id: ` ${validBoxId} `,
            title: "  <b>Useful writeup</b>  ",
            content_md: longContent
        })).toEqual({
            valid: true,
            boxId: validBoxId,
            title: "<b>Useful writeup</b>",
            contentMd: longContent
        });
    });

    it("rejects invalid submission fields", () => {
        expect(validateBoxWriteupSubmission({
            box_id: "bad-id",
            title: "Useful writeup",
            content_md: longContent
        })).toEqual({ valid: false, message: "Invalid box_id format" });

        expect(validateBoxWriteupSubmission({
            box_id: validBoxId,
            title: "No",
            content_md: longContent
        })).toEqual({ valid: false, message: "title must be between 3 and 120 characters" });

        expect(validateBoxWriteupSubmission({
            box_id: validBoxId,
            title: "Useful writeup",
            content_md: "too short"
        })).toEqual({ valid: false, message: "content_md must be at least 80 characters" });
    });

    it("validates writeup reviews", () => {
        expect(validateBoxWriteupReview({
            writeup_id: validWriteupId,
            status: BoxWriteupStatus.rejected,
            reject_reason: "<script>bad()</script> needs more detail",
            is_public: false
        })).toEqual({
            valid: true,
            writeupId: validWriteupId,
            status: BoxWriteupStatus.rejected,
            rejectReason: "needs more detail",
            isPublic: false
        });
    });

    it("rejects invalid writeup review status and visibility", () => {
        expect(validateBoxWriteupReview({
            writeup_id: validWriteupId,
            status: BoxWriteupStatus.pending
        })).toEqual({ valid: false, message: "status must be approved or rejected" });

        expect(validateBoxWriteupReview({
            writeup_id: validWriteupId,
            status: BoxWriteupStatus.approved,
            is_public: "yes"
        })).toEqual({ valid: false, message: "is_public must be a boolean" });
    });

    it("validates visibility updates", () => {
        expect(validateBoxWriteupVisibility({
            writeup_id: validWriteupId,
            is_public: true
        })).toEqual({
            valid: true,
            writeupId: validWriteupId,
            isPublic: true
        });

        expect(validateBoxWriteupVisibility({
            writeup_id: "bad-id",
            is_public: true
        })).toEqual({ valid: false, message: "Invalid writeup_id format" });
    });

    it("validates public writeup query", () => {
        expect(validatePublicBoxWriteupsQuery({ box_id: validBoxId })).toEqual({
            valid: true,
            boxId: validBoxId
        });

        expect(validatePublicBoxWriteupsQuery({})).toEqual({
            valid: false,
            message: "Invalid box_id format"
        });
    });

    it("validates my writeup optional box filter", () => {
        expect(validateMyBoxWriteupsQuery({})).toEqual({ valid: true });
        expect(validateMyBoxWriteupsQuery({ box_id: validBoxId })).toEqual({
            valid: true,
            boxId: validBoxId
        });
        expect(validateMyBoxWriteupsQuery({ box_id: "bad-id" })).toEqual({
            valid: false,
            message: "Invalid box_id format"
        });
    });

    it("validates writeup submission filters", () => {
        expect(validateBoxWriteupSubmissionsQuery({
            box_id: validBoxId,
            status: BoxWriteupStatus.pending
        })).toEqual({
            valid: true,
            boxId: validBoxId,
            status: BoxWriteupStatus.pending
        });

        expect(validateBoxWriteupSubmissionsQuery({ status: "invalid" })).toEqual({
            valid: false,
            message: "Invalid writeup status"
        });
    });
});
