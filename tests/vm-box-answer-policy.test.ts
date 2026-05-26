import { describe, expect, it } from "vitest";
import {
    buildVMBoxAnswerSubmissionOutcome,
    buildVMBoxAnswerStatus,
    evaluateVMBoxFlagAnswer,
    validateVMBoxAnswerVMAccess,
    validateVMBoxAnswerRecordRequest,
    validateVMBoxAnswerSubmission
} from "../src/modules/vm-box/VMBoxAnswerPolicy";

describe("VMBoxAnswerPolicy", () => {
    it("validates answer record VM IDs", () => {
        expect(validateVMBoxAnswerRecordRequest({
            vm_id: " 507f1f77bcf86cd799439011 "
        })).toEqual({
            valid: true,
            vmId: "507f1f77bcf86cd799439011"
        });
    });

    it("uses the existing answer-record error for invalid VM IDs", () => {
        expect(validateVMBoxAnswerRecordRequest({ vm_id: "bad-id" })).toEqual({
            valid: false,
            message: "Missing or invalid required parameter: vm_id"
        });
    });

    it("validates answer submissions without trimming the answer", () => {
        expect(validateVMBoxAnswerSubmission({
            vm_id: "507f1f77bcf86cd799439011",
            flag_id: " flag_1 ",
            flag_answer: " flag{keep-spaces} "
        })).toEqual({
            valid: true,
            vmId: "507f1f77bcf86cd799439011",
            flagId: "flag_1",
            flagAnswer: " flag{keep-spaces} "
        });
    });

    it("rejects missing submission fields", () => {
        expect(validateVMBoxAnswerSubmission({
            vm_id: "507f1f77bcf86cd799439011",
            flag_id: "flag_1"
        })).toEqual({
            valid: false,
            message: "Missing or invalid required parameters: vm_id, flag_id, flag_answer"
        });
    });

    it("rejects unsafe dynamic flag identifiers", () => {
        expect(validateVMBoxAnswerSubmission({
            vm_id: "507f1f77bcf86cd799439011",
            flag_id: "$set.admin",
            flag_answer: "anything"
        })).toEqual({
            valid: false,
            message: "Invalid flag_id format"
        });
    });

    it("builds answer status only for configured flags", () => {
        expect(buildVMBoxAnswerStatus(
            new Map<string, unknown>([
                ["user", "flag{user}"],
                ["root", "flag{root}"],
                ["ignored", 123]
            ]),
            { user: true, root: false, hidden: true }
        )).toEqual({
            user: true,
            root: false
        });
    });

    it("evaluates flag answers from normalized flag maps", () => {
        const flagAnswers = {
            user: "flag{user}",
            root: "flag{root}"
        };

        expect(evaluateVMBoxFlagAnswer(flagAnswers, "user", "flag{user}")).toEqual({
            validFlag: true,
            correct: true
        });
        expect(evaluateVMBoxFlagAnswer(flagAnswers, "root", "wrong")).toEqual({
            validFlag: true,
            correct: false
        });
        expect(evaluateVMBoxFlagAnswer(flagAnswers, "admin", "flag{admin}")).toEqual({
            validFlag: false,
            correct: false
        });
    });

    it("builds idempotent response for flags that were already solved", () => {
        expect(buildVMBoxAnswerSubmissionOutcome("user", true, false)).toEqual({
            shouldPersistCorrectAnswer: false,
            message: "Flag already answered correctly",
            response: { flag_id: "user", correct: true }
        });
    });

    it("marks newly correct answers for persistence", () => {
        expect(buildVMBoxAnswerSubmissionOutcome("root", undefined, true)).toEqual({
            shouldPersistCorrectAnswer: true,
            message: "Correct answer!",
            response: { flag_id: "root", correct: true }
        });
    });

    it("does not persist incorrect answers", () => {
        expect(buildVMBoxAnswerSubmissionOutcome("root", undefined, false)).toEqual({
            shouldPersistCorrectAnswer: false,
            message: "Incorrect answer.",
            response: { flag_id: "root", correct: false }
        });
    });

    it("allows answer access only for owner-owned box VMs", () => {
        expect(validateVMBoxAnswerVMAccess({
            owner: "user-1",
            is_box_vm: true,
            box_id: "box-1"
        }, "user-1")).toEqual({
            valid: true,
            boxId: "box-1"
        });
    });

    it("rejects answer access for non-owners before box checks", () => {
        expect(validateVMBoxAnswerVMAccess({
            owner: "user-2",
            is_box_vm: false,
            box_id: undefined
        }, "user-1")).toEqual({
            valid: false,
            statusCode: 403,
            message: "You do not have permission to access this VM"
        });
    });

    it("rejects owner-owned VMs that were not created from a box", () => {
        expect(validateVMBoxAnswerVMAccess({
            owner: { toString: () => "user-1" },
            is_box_vm: true,
            box_id: ""
        }, { toString: () => "user-1" })).toEqual({
            valid: false,
            statusCode: 400,
            message: "This VM is not created from a box"
        });
    });
});
