import Roles from "../../enum/role";
import { validateObjectIdInput } from "../common/ObjectIdPolicy";

export type VMBoxAiAssistantTarget =
    | { type: "box"; boxId: string }
    | { type: "submission"; submissionId: string };

export function validateVMBoxAiAssistantSettingRequest(
    value: { box_id?: unknown; submission_id?: unknown; allow_ai_assistant?: unknown }
): { valid: true; target: VMBoxAiAssistantTarget; allowAiAssistant: boolean } | { valid: false; message: string } {
    if (typeof value.allow_ai_assistant !== "boolean") {
        return { valid: false, message: "allow_ai_assistant must be a boolean" };
    }

    if (!value.box_id && !value.submission_id) {
        return { valid: false, message: "box_id or submission_id is required" };
    }

    if (value.box_id) {
        const boxIdResult = validateObjectIdInput(value.box_id, "box_id");
        if (!boxIdResult.valid) {
            return { valid: false, message: "Invalid box_id format" };
        }
        return {
            valid: true,
            target: { type: "box", boxId: boxIdResult.value },
            allowAiAssistant: value.allow_ai_assistant
        };
    }

    const submissionIdResult = validateObjectIdInput(value.submission_id, "submission_id");
    if (!submissionIdResult.valid) {
        return { valid: false, message: "Invalid submission_id format" };
    }

    return {
        valid: true,
        target: { type: "submission", submissionId: submissionIdResult.value },
        allowAiAssistant: value.allow_ai_assistant
    };
}

export function canUpdateVMBoxAiAssistantSetting(
    userRole: unknown,
    userId: unknown,
    submitterUserId: unknown
): boolean {
    if (userRole === Roles.SuperAdmin) {
        return true;
    }

    return typeof userId === "string" &&
        typeof submitterUserId === "string" &&
        submitterUserId === userId;
}
