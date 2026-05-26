import { validateObjectIdInput } from "../common/ObjectIdPolicy";
import { normalizeFlagAnswers } from "./VMBoxSubmissionCreatePolicy";

const FLAG_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function validateVMBoxAnswerRecordRequest(
    value: { vm_id?: unknown }
): { valid: true; vmId: string } | { valid: false; message: string } {
    const vmIdResult = validateObjectIdInput(value.vm_id, "vm_id");
    if (!vmIdResult.valid) {
        return { valid: false, message: "Missing or invalid required parameter: vm_id" };
    }

    return { valid: true, vmId: vmIdResult.value };
}

export function validateVMBoxAnswerSubmission(
    value: { vm_id?: unknown; flag_id?: unknown; flag_answer?: unknown }
): { valid: true; vmId: string; flagId: string; flagAnswer: string } | { valid: false; message: string } {
    const vmIdResult = validateObjectIdInput(value.vm_id, "vm_id");
    if (!vmIdResult.valid || typeof value.flag_id !== "string" || typeof value.flag_answer !== "string") {
        return { valid: false, message: "Missing or invalid required parameters: vm_id, flag_id, flag_answer" };
    }

    const flagId = value.flag_id.trim();
    if (!FLAG_ID_PATTERN.test(flagId)) {
        return { valid: false, message: "Invalid flag_id format" };
    }

    return {
        valid: true,
        vmId: vmIdResult.value,
        flagId,
        flagAnswer: value.flag_answer
    };
}

export function buildVMBoxAnswerStatus(
    rawFlagAnswers: unknown,
    answerRecord: Record<string, unknown> | null | undefined
): Record<string, boolean> {
    const flagAnswers = normalizeFlagAnswers(rawFlagAnswers);
    const answerStatus: Record<string, boolean> = {};
    for (const flagId of Object.keys(flagAnswers)) {
        answerStatus[flagId] = answerRecord?.[flagId] === true;
    }
    return answerStatus;
}

export function evaluateVMBoxFlagAnswer(
    rawFlagAnswers: unknown,
    flagId: string,
    flagAnswer: string
): { validFlag: boolean; correct: boolean } {
    const flagAnswers = normalizeFlagAnswers(rawFlagAnswers);
    if (!(flagId in flagAnswers)) {
        return { validFlag: false, correct: false };
    }

    return {
        validFlag: true,
        correct: flagAnswers[flagId] === flagAnswer
    };
}

export function buildVMBoxAnswerSubmissionOutcome(
    flagId: string,
    currentFlagValue: unknown,
    isCorrect: boolean
): {
    shouldPersistCorrectAnswer: boolean;
    message: string;
    response: { flag_id: string; correct: boolean };
} {
    if (currentFlagValue === true) {
        return {
            shouldPersistCorrectAnswer: false,
            message: "Flag already answered correctly",
            response: { flag_id: flagId, correct: true }
        };
    }

    return {
        shouldPersistCorrectAnswer: isCorrect,
        message: isCorrect ? "Correct answer!" : "Incorrect answer.",
        response: { flag_id: flagId, correct: isCorrect }
    };
}

export function validateVMBoxAnswerVMAccess(
    vm: { owner?: unknown; is_box_vm?: unknown; box_id?: unknown },
    userId: unknown
): { valid: true; boxId: string } | { valid: false; statusCode: 400 | 403; message: string } {
    const ownerId = typeof vm.owner === "string" ? vm.owner : vm.owner?.toString?.();
    const actorId = typeof userId === "string" ? userId : userId?.toString?.();

    if (!ownerId || !actorId || ownerId !== actorId) {
        return {
            valid: false,
            statusCode: 403,
            message: "You do not have permission to access this VM"
        };
    }

    const boxId = typeof vm.box_id === "string" ? vm.box_id : vm.box_id?.toString?.();
    if (vm.is_box_vm !== true || !boxId) {
        return {
            valid: false,
            statusCode: 400,
            message: "This VM is not created from a box"
        };
    }

    return { valid: true, boxId };
}
