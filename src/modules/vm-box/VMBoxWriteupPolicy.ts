import { BoxWriteupStatus } from "../../interfaces/BoxWriteup";
import { sanitizeString } from "../../utils/sanitize";
import { validateObjectIdInput } from "../common/ObjectIdPolicy";

export function validateBoxWriteupSubmission(
    value: { box_id?: unknown; title?: unknown; content_md?: unknown }
): { valid: true; boxId: string; title: string; contentMd: string } | { valid: false; message: string } {
    const boxIdResult = validateObjectIdInput(value.box_id, "box_id");
    if (!boxIdResult.valid) {
        return { valid: false, message: "Invalid box_id format" };
    }

    if (typeof value.title !== "string" || typeof value.content_md !== "string") {
        return { valid: false, message: "title and content_md are required" };
    }

    const title = sanitizeString(value.title).trim();
    const contentMd = sanitizeString(value.content_md).trim();
    if (title.length < 3 || title.length > 120) {
        return { valid: false, message: "title must be between 3 and 120 characters" };
    }
    if (contentMd.length < 80) {
        return { valid: false, message: "content_md must be at least 80 characters" };
    }
    if (contentMd.length > 200000) {
        return { valid: false, message: "content_md exceeds maximum length of 200000 characters" };
    }

    return {
        valid: true,
        boxId: boxIdResult.value,
        title,
        contentMd
    };
}

export function validatePublicBoxWriteupsQuery(
    value: { box_id?: unknown }
): { valid: true; boxId: string } | { valid: false; message: string } {
    const boxIdResult = validateObjectIdInput(value.box_id, "box_id");
    return boxIdResult.valid
        ? { valid: true, boxId: boxIdResult.value }
        : { valid: false, message: "Invalid box_id format" };
}

export function validateMyBoxWriteupsQuery(
    value: { box_id?: unknown }
): { valid: true; boxId?: string } | { valid: false; message: string } {
    if (value.box_id === undefined) {
        return { valid: true };
    }

    return validatePublicBoxWriteupsQuery(value);
}

export function validateBoxWriteupSubmissionsQuery(
    value: { box_id?: unknown; status?: unknown }
): { valid: true; boxId?: string; status?: BoxWriteupStatus } | { valid: false; message: string } {
    let status: BoxWriteupStatus | undefined;
    if (value.status !== undefined) {
        if (typeof value.status !== "string" || !Object.values(BoxWriteupStatus).includes(value.status as BoxWriteupStatus)) {
            return { valid: false, message: "Invalid writeup status" };
        }
        status = value.status as BoxWriteupStatus;
    }

    if (value.box_id === undefined) {
        return { valid: true, status };
    }

    const boxIdResult = validatePublicBoxWriteupsQuery(value);
    if (!boxIdResult.valid) {
        return boxIdResult;
    }

    return { valid: true, boxId: boxIdResult.boxId, status };
}

export function validateBoxWriteupId(value: unknown): { valid: true; writeupId: string } | { valid: false; message: string } {
    const writeupIdResult = validateObjectIdInput(value, "writeup_id");
    return writeupIdResult.valid
        ? { valid: true, writeupId: writeupIdResult.value }
        : { valid: false, message: "Invalid writeup_id format" };
}

export function validateBoxWriteupReview(
    value: { writeup_id?: unknown; status?: unknown; reject_reason?: unknown; is_public?: unknown }
): { valid: true; writeupId: string; status: BoxWriteupStatus.approved | BoxWriteupStatus.rejected; rejectReason?: string; isPublic?: boolean } | { valid: false; message: string } {
    const writeupIdResult = validateBoxWriteupId(value.writeup_id);
    if (!writeupIdResult.valid) {
        return writeupIdResult;
    }

    if (![BoxWriteupStatus.approved, BoxWriteupStatus.rejected].includes(value.status as BoxWriteupStatus)) {
        return { valid: false, message: "status must be approved or rejected" };
    }

    if (value.is_public !== undefined && typeof value.is_public !== "boolean") {
        return { valid: false, message: "is_public must be a boolean" };
    }

    const rejectReason = typeof value.reject_reason === "string"
        ? sanitizeString(value.reject_reason).trim()
        : "";

    return {
        valid: true,
        writeupId: writeupIdResult.writeupId,
        status: value.status as BoxWriteupStatus.approved | BoxWriteupStatus.rejected,
        rejectReason,
        isPublic: value.is_public
    };
}

export function validateBoxWriteupVisibility(
    value: { writeup_id?: unknown; is_public?: unknown }
): { valid: true; writeupId: string; isPublic: boolean } | { valid: false; message: string } {
    const writeupIdResult = validateBoxWriteupId(value.writeup_id);
    if (!writeupIdResult.valid) {
        return writeupIdResult;
    }

    if (typeof value.is_public !== "boolean") {
        return { valid: false, message: "is_public must be a boolean" };
    }

    return {
        valid: true,
        writeupId: writeupIdResult.writeupId,
        isPublic: value.is_public
    };
}
