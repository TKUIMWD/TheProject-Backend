import { sanitizeString } from "../../utils/sanitize";
import { validateObjectIdInput } from "../common/ObjectIdPolicy";

export interface VMBoxSubmissionCreateFields {
    vmtemplate_id: string;
    box_setup_description: string;
    flag_answers: Record<string, string>;
    allow_ai_assistant: boolean;
    design_md: string;
    setup_md: string;
    writeup_md: string;
}

export interface VMBoxSubmissionCreatePayload extends VMBoxSubmissionCreateFields {
    submitter_user_id: string;
    submitted_date: Date;
    status: string;
}

export function validateVMBoxSubmissionCreateRequest(
    value: {
        vmtemplate_id?: unknown;
        box_setup_description?: unknown;
        flag_answers?: unknown;
        allow_ai_assistant?: unknown;
        design_md?: unknown;
        setup_md?: unknown;
        writeup_md?: unknown;
    }
): { valid: true; fields: VMBoxSubmissionCreateFields } | { valid: false; message: string } {
    if (!value.vmtemplate_id || !value.box_setup_description) {
        return { valid: false, message: "Missing required fields: vmtemplate_id, box_setup_description" };
    }

    const templateIdResult = validateObjectIdInput(value.vmtemplate_id, "vmtemplate_id");
    if (!templateIdResult.valid) {
        return { valid: false, message: "Invalid vmtemplate_id format" };
    }

    const boxSetupDescription = sanitizeString(asString(value.box_setup_description));
    if (boxSetupDescription.trim() === "") {
        return { valid: false, message: "box_setup_description cannot be empty or strings containing security-sensitive characters" };
    }

    return {
        valid: true,
        fields: {
            vmtemplate_id: templateIdResult.value,
            box_setup_description: boxSetupDescription,
            flag_answers: normalizeFlagAnswers(value.flag_answers),
            allow_ai_assistant: value.allow_ai_assistant !== false,
            design_md: sanitizeString(asString(value.design_md)),
            setup_md: sanitizeString(asString(value.setup_md)),
            writeup_md: sanitizeString(asString(value.writeup_md))
        }
    };
}

export function normalizeFlagAnswers(raw: unknown): Record<string, string> {
    if (!raw) {
        return {};
    }

    const entries = raw instanceof Map
        ? Array.from(raw.entries())
        : typeof raw === "object"
            ? Object.entries(raw as Record<string, unknown>)
            : [];

    return entries.reduce<Record<string, string>>((answers, [key, value]) => {
        if (typeof key === "string" && key.trim() !== "" && typeof value === "string") {
            answers[key] = value;
        }
        return answers;
    }, {});
}

export function buildVMBoxSubmissionCreatePayload(input: {
    fields: VMBoxSubmissionCreateFields;
    submitterUserId: string;
    status: string;
    submittedDate?: Date;
}): VMBoxSubmissionCreatePayload {
    return {
        vmtemplate_id: input.fields.vmtemplate_id,
        box_setup_description: input.fields.box_setup_description,
        submitter_user_id: input.submitterUserId,
        submitted_date: input.submittedDate || new Date(),
        status: input.status,
        flag_answers: input.fields.flag_answers,
        allow_ai_assistant: input.fields.allow_ai_assistant,
        design_md: input.fields.design_md,
        setup_md: input.fields.setup_md,
        writeup_md: input.fields.writeup_md
    };
}

export function buildVMBoxSubmissionCreateResponse(input: {
    submissionId: unknown;
    vmtemplateId: string;
    submittedDate: Date;
    submitterEmail: string;
}): {
    submission_id: unknown;
    vmtemplate_id: string;
    submitted_date: Date;
    submitter: string;
} {
    return {
        submission_id: input.submissionId,
        vmtemplate_id: input.vmtemplateId,
        submitted_date: input.submittedDate,
        submitter: input.submitterEmail
    };
}

function asString(value: unknown): string {
    return typeof value === "string" ? value : "";
}
