import { ReviewInputValidation, ReviewPolicy } from "../reviews/ReviewPolicy";
import { validateObjectIdInput } from "../common/ObjectIdPolicy";

export function validateBoxReviewCreateRequest(
    value: { box_id?: unknown; rating?: unknown; comment?: unknown }
): { valid: true; boxId: string; reviewInput: Extract<ReviewInputValidation, { ok: true }> } | { valid: false; message: string } {
    if (!value.box_id || typeof value.rating !== "number") {
        return { valid: false, message: "Missing required fields: box_id and rating" };
    }

    const boxIdResult = validateBoxId(value.box_id);
    if (!boxIdResult.valid) {
        return boxIdResult;
    }

    const reviewInput = ReviewPolicy.validateInput(value.rating, value.comment);
    if (!reviewInput.ok) {
        return { valid: false, message: reviewInput.message };
    }

    return { valid: true, boxId: boxIdResult.boxId, reviewInput };
}

export function validateBoxReviewsQuery(
    value: { box_id?: unknown }
): { valid: true; boxId: string } | { valid: false; message: string } {
    if (!value.box_id) {
        return { valid: false, message: "Missing required parameter: box_id" };
    }

    return validateBoxId(value.box_id);
}

export function validateBoxReviewUpdateRequest(
    value: { review_id?: unknown; box_id?: unknown; rating?: unknown; comment?: unknown }
): { valid: true; reviewId: string; boxId: string; reviewInput: Extract<ReviewInputValidation, { ok: true }> } | { valid: false; message: string } {
    const reviewIdResult = validateReviewId(value.review_id);
    if (!reviewIdResult.valid) {
        return reviewIdResult;
    }

    const boxIdResult = validateBoxId(value.box_id);
    if (!boxIdResult.valid) {
        return boxIdResult;
    }

    const reviewInput = ReviewPolicy.validateInput(value.rating, value.comment);
    if (!reviewInput.ok) {
        return { valid: false, message: reviewInput.message };
    }

    return { valid: true, reviewId: reviewIdResult.reviewId, boxId: boxIdResult.boxId, reviewInput };
}

export function validateBoxReviewDeleteRequest(
    value: { review_id?: unknown; box_id?: unknown }
): { valid: true; reviewId: string; boxId: string } | { valid: false; message: string } {
    const reviewIdResult = validateReviewId(value.review_id);
    if (!reviewIdResult.valid) {
        return reviewIdResult;
    }

    const boxIdResult = validateBoxId(value.box_id);
    if (!boxIdResult.valid) {
        return boxIdResult;
    }

    return { valid: true, reviewId: reviewIdResult.reviewId, boxId: boxIdResult.boxId };
}

function validateBoxId(value: unknown): { valid: true; boxId: string } | { valid: false; message: string } {
    const boxIdResult = validateObjectIdInput(value, "box_id");
    return boxIdResult.valid
        ? { valid: true, boxId: boxIdResult.value }
        : { valid: false, message: "Invalid box_id format" };
}

function validateReviewId(value: unknown): { valid: true; reviewId: string } | { valid: false; message: string } {
    const reviewIdResult = validateObjectIdInput(value, "review_id");
    return reviewIdResult.valid
        ? { valid: true, reviewId: reviewIdResult.value }
        : { valid: false, message: "Invalid review_id format" };
}
