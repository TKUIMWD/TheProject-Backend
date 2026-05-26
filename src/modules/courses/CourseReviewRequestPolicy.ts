import { validateObjectIdInput } from "../common/ObjectIdPolicy";
import { ReviewInputValidation } from "../reviews/ReviewPolicy";
import { validateCourseReviewInput } from "./CourseReviewPolicy";

export function validateCourseReviewCreateRequest(
    value: { course_id?: unknown; rating?: unknown; comment?: unknown }
): { valid: true; courseId: string; reviewInput: Extract<ReviewInputValidation, { ok: true }> } | { valid: false; message: string } {
    if (!value.course_id || typeof value.rating !== "number") {
        return { valid: false, message: "Missing required fields: course_id and rating" };
    }

    const courseIdResult = validateCourseId(value.course_id);
    if (!courseIdResult.valid) {
        return courseIdResult;
    }

    const reviewInput = validateCourseReviewInput(value.rating, value.comment);
    if (!reviewInput.ok) {
        return { valid: false, message: reviewInput.message };
    }

    return { valid: true, courseId: courseIdResult.courseId, reviewInput };
}

export function validateCourseReviewsQuery(
    value: { course_id?: unknown }
): { valid: true; courseId: string } | { valid: false; message: string } {
    if (!value.course_id || typeof value.course_id !== "string") {
        return { valid: false, message: "course_id is required" };
    }

    return validateCourseId(value.course_id);
}

export function validateCourseReviewUpdateRequest(
    value: { review_id?: unknown; course_id?: unknown; rating?: unknown; comment?: unknown }
): { valid: true; reviewId: string; courseId: string; reviewInput: Extract<ReviewInputValidation, { ok: true }> } | { valid: false; message: string } {
    const reviewIdResult = validateReviewId(value.review_id);
    if (!reviewIdResult.valid) {
        return reviewIdResult;
    }

    const courseIdResult = validateCourseId(value.course_id);
    if (!courseIdResult.valid) {
        return courseIdResult;
    }

    const reviewInput = validateCourseReviewInput(value.rating, value.comment);
    if (!reviewInput.ok) {
        return { valid: false, message: reviewInput.message };
    }

    return { valid: true, reviewId: reviewIdResult.reviewId, courseId: courseIdResult.courseId, reviewInput };
}

export function validateCourseReviewDeleteRequest(
    value: { review_id?: unknown; course_id?: unknown }
): { valid: true; reviewId: string; courseId: string } | { valid: false; message: string } {
    const reviewIdResult = validateReviewId(value.review_id);
    if (!reviewIdResult.valid) {
        return reviewIdResult;
    }

    const courseIdResult = validateCourseId(value.course_id);
    if (!courseIdResult.valid) {
        return courseIdResult;
    }

    return { valid: true, reviewId: reviewIdResult.reviewId, courseId: courseIdResult.courseId };
}

function validateCourseId(value: unknown): { valid: true; courseId: string } | { valid: false; message: string } {
    const courseIdResult = validateObjectIdInput(value, "course_id");
    return courseIdResult.valid
        ? { valid: true, courseId: courseIdResult.value }
        : { valid: false, message: "Invalid course_id format" };
}

function validateReviewId(value: unknown): { valid: true; reviewId: string } | { valid: false; message: string } {
    const reviewIdResult = validateObjectIdInput(value, "review_id");
    return reviewIdResult.valid
        ? { valid: true, reviewId: reviewIdResult.value }
        : { valid: false, message: "Invalid review_id format" };
}
