import { sanitizeString } from "../../utils/sanitize";

export interface ChapterContentFields {
    chapter_name: string;
    chapter_subtitle: string;
    chapter_content: string;
    chapter_order: number;
}

export interface ChapterCreateFields extends ChapterContentFields {
    template_id: string;
}

export interface ChapterUpdateFields {
    chapter_name?: string;
    chapter_subtitle?: string;
    waiting_for_approve_content?: string;
    chapter_order?: number;
}

export function validateChapterCreateInput(
    value: Partial<Record<keyof ChapterContentFields | "template_id", unknown>>
): { valid: true; fields: ChapterCreateFields } | { valid: false; message: string } {
    const requiredFields: Array<keyof ChapterContentFields> = [
        "chapter_name",
        "chapter_subtitle",
        "chapter_content",
        "chapter_order"
    ];
    const missingFields = requiredFields.filter((field) => value[field] === undefined);
    if (missingFields.length > 0) {
        return { valid: false, message: `Missing required key(s) in request body: ${missingFields.join(", ")}` };
    }

    const fields = validateChapterContentFields(value, {
        chapterNameMessage: "chapter_name cannot be empty or strings containing security-sensitive characters",
        chapterOrderMessage: "chapter_order must be a non-negative number",
        requireSubtitleAndContent: true
    });
    if (!fields.valid) {
        return fields;
    }

    return {
        valid: true,
        fields: {
            chapter_name: fields.fields.chapter_name as string,
            chapter_subtitle: fields.fields.chapter_subtitle as string,
            chapter_content: fields.fields.waiting_for_approve_content as string,
            chapter_order: fields.fields.chapter_order as number,
            template_id: asString(value.template_id)
        }
    };
}

export function validateChapterUpdateInput(
    value: Partial<Record<keyof ChapterContentFields, unknown>>
): { valid: true; updates: ChapterUpdateFields } | { valid: false; message: string } {
    const fields = validateChapterContentFields(value, {
        chapterNameMessage: "Chapter name cannot be empty.",
        chapterOrderMessage: "chapter_order must be a non-negative number.",
        requireSubtitleAndContent: false
    });
    if (!fields.valid) {
        return fields;
    }

    if (Object.keys(fields.fields).length === 0) {
        return { valid: false, message: "No valid fields provided for update." };
    }

    return { valid: true, updates: fields.fields };
}

function validateChapterContentFields(
    value: Partial<Record<keyof ChapterContentFields, unknown>>,
    options: {
        chapterNameMessage: string;
        chapterOrderMessage: string;
        requireSubtitleAndContent: boolean;
    }
): { valid: true; fields: ChapterUpdateFields } | { valid: false; message: string } {
    const fields: ChapterUpdateFields = {};

    if (value.chapter_name !== undefined) {
        const chapterName = sanitizeString(asString(value.chapter_name));
        if (chapterName.trim() === '') {
            return { valid: false, message: options.chapterNameMessage };
        }
        fields.chapter_name = chapterName;
    }

    if (value.chapter_subtitle !== undefined) {
        const chapterSubtitle = sanitizeString(asString(value.chapter_subtitle));
        if (options.requireSubtitleAndContent && chapterSubtitle.trim() === '') {
            return { valid: false, message: "chapter_subtitle cannot be empty or strings containing security-sensitive characters" };
        }
        fields.chapter_subtitle = chapterSubtitle;
    }

    if (value.chapter_content !== undefined) {
        const chapterContent = sanitizeString(asString(value.chapter_content));
        if (options.requireSubtitleAndContent && chapterContent.trim() === '') {
            return { valid: false, message: "chapter_content cannot be empty or strings containing security-sensitive characters" };
        }
        fields.waiting_for_approve_content = chapterContent;
    }

    if (value.chapter_order !== undefined) {
        if (typeof value.chapter_order !== "number" || value.chapter_order < 0) {
            return { valid: false, message: options.chapterOrderMessage };
        }
        fields.chapter_order = value.chapter_order;
    }

    return { valid: true, fields };
}

function asString(value: unknown): string {
    return typeof value === "string" ? value : "";
}
