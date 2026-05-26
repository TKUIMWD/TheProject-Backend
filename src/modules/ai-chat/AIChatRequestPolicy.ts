import { validateObjectIdInput } from "../common/ObjectIdPolicy";

export const AI_CHAT_MAX_INPUT_LENGTH = 2000;

export function validateAIChatUserInput(
    value: unknown,
    fieldName: string = "user_input"
): { valid: true; input: string } | { valid: false; message: string } {
    if (typeof value !== "string" || value.trim().length === 0) {
        return { valid: false, message: `${fieldName} must be a non-empty string` };
    }

    if (value.length > AI_CHAT_MAX_INPUT_LENGTH) {
        return { valid: false, message: `${fieldName} exceeds maximum length of ${AI_CHAT_MAX_INPUT_LENGTH} characters` };
    }

    return { valid: true, input: value.trim() };
}

export function sanitizeAIChatUserInput(input: string): string {
    let sanitized = input.trim();

    const injectionPatterns = [
        /ignore\s+(all\s+)?previous\s+instructions?/gi,
        /forget\s+(all\s+)?previous\s+(instructions?|prompts?)/gi,
        /you\s+are\s+now/gi,
        /new\s+instructions?:/gi,
        /system\s*:/gi,
        /\[SYSTEM\]/gi,
        /\[INST\]/gi,
        /<!--|-->/g,
        /<\|im_start\|>/gi,
        /<\|im_end\|>/gi,
    ];

    for (const pattern of injectionPatterns) {
        sanitized = sanitized.replace(pattern, '[FILTERED]');
    }

    if (sanitized.length > AI_CHAT_MAX_INPUT_LENGTH) {
        sanitized = sanitized.substring(0, AI_CHAT_MAX_INPUT_LENGTH);
    }

    return sanitized;
}

export function validateBoxHintRequest(
    value: { vm_id?: unknown; user_input?: unknown }
): { valid: true; vmId: string; userInput: string } | { valid: false; message: string } {
    if (!value.vm_id || !value.user_input) {
        return { valid: false, message: "Missing required fields: vm_id and user_input are required" };
    }

    const vmIdResult = validateObjectIdInput(value.vm_id, "VM ID");
    if (!vmIdResult.valid) {
        return { valid: false, message: vmIdResult.message };
    }

    const inputResult = validateAIChatUserInput(value.user_input);
    if (!inputResult.valid) {
        return inputResult;
    }

    return {
        valid: true,
        vmId: vmIdResult.value,
        userInput: inputResult.input
    };
}

export function validateOptionalCurrentVMId(
    value: unknown
): { valid: true; vmId?: string } | { valid: false; message: string } {
    if (value === undefined || value === null || value === "") {
        return { valid: true };
    }

    const vmIdResult = validateObjectIdInput(value, "current_vm_id");
    if (!vmIdResult.valid) {
        return { valid: false, message: vmIdResult.message };
    }

    return { valid: true, vmId: vmIdResult.value };
}
