import { describe, expect, it } from "vitest";
import Roles from "../src/enum/role";
import {
    canUpdateVMBoxAiAssistantSetting,
    validateVMBoxAiAssistantSettingRequest
} from "../src/modules/vm-box/VMBoxAiAssistantPolicy";

const boxId = "507f1f77bcf86cd799439011";
const submissionId = "507f1f77bcf86cd799439012";

describe("VMBoxAiAssistantPolicy", () => {
    it("validates box setting requests", () => {
        expect(validateVMBoxAiAssistantSettingRequest({
            box_id: ` ${boxId} `,
            allow_ai_assistant: false
        })).toEqual({
            valid: true,
            target: { type: "box", boxId },
            allowAiAssistant: false
        });
    });

    it("validates submission setting requests", () => {
        expect(validateVMBoxAiAssistantSettingRequest({
            submission_id: submissionId,
            allow_ai_assistant: true
        })).toEqual({
            valid: true,
            target: { type: "submission", submissionId },
            allowAiAssistant: true
        });
    });

    it("keeps box_id precedence when both ids are provided", () => {
        expect(validateVMBoxAiAssistantSettingRequest({
            box_id: boxId,
            submission_id: submissionId,
            allow_ai_assistant: true
        })).toEqual({
            valid: true,
            target: { type: "box", boxId },
            allowAiAssistant: true
        });
    });

    it("rejects invalid requests with API messages", () => {
        expect(validateVMBoxAiAssistantSettingRequest({
            box_id: boxId,
            allow_ai_assistant: "true"
        })).toEqual({
            valid: false,
            message: "allow_ai_assistant must be a boolean"
        });

        expect(validateVMBoxAiAssistantSettingRequest({
            allow_ai_assistant: true
        })).toEqual({
            valid: false,
            message: "box_id or submission_id is required"
        });

        expect(validateVMBoxAiAssistantSettingRequest({
            box_id: "bad-id",
            allow_ai_assistant: true
        })).toEqual({
            valid: false,
            message: "Invalid box_id format"
        });

        expect(validateVMBoxAiAssistantSettingRequest({
            submission_id: "bad-id",
            allow_ai_assistant: true
        })).toEqual({
            valid: false,
            message: "Invalid submission_id format"
        });
    });

    it("allows submitters and SuperAdmin to update settings", () => {
        expect(canUpdateVMBoxAiAssistantSetting(Roles.SuperAdmin, "user-1", "user-2")).toBe(true);
        expect(canUpdateVMBoxAiAssistantSetting(Roles.Admin, "user-1", "user-1")).toBe(true);
        expect(canUpdateVMBoxAiAssistantSetting(Roles.Admin, "user-1", "user-2")).toBe(false);
    });
});
