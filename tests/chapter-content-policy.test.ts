import { describe, expect, it } from "vitest";
import {
    validateChapterCreateInput,
    validateChapterUpdateInput
} from "../src/modules/courses/ChapterContentPolicy";

const validChapter = {
    chapter_name: "  <b>Recon</b>  ",
    chapter_subtitle: "Enumeration basics",
    chapter_content: "Start with service discovery.",
    chapter_order: 1,
    template_id: "template-123"
};

describe("ChapterContentPolicy", () => {
    it("validates and sanitizes create input", () => {
        expect(validateChapterCreateInput(validChapter)).toEqual({
            valid: true,
            fields: {
                chapter_name: "  <b>Recon</b>  ",
                chapter_subtitle: "Enumeration basics",
                chapter_content: "Start with service discovery.",
                chapter_order: 1,
                template_id: "template-123"
            }
        });
    });

    it("reports missing create fields", () => {
        expect(validateChapterCreateInput({
            chapter_name: "Recon",
            chapter_order: 1
        })).toEqual({
            valid: false,
            message: "Missing required key(s) in request body: chapter_subtitle, chapter_content"
        });
    });

    it("rejects unsafe or invalid create fields with existing messages", () => {
        expect(validateChapterCreateInput({
            ...validChapter,
            chapter_name: "<script>bad()</script>"
        })).toEqual({
            valid: false,
            message: "chapter_name cannot be empty or strings containing security-sensitive characters"
        });

        expect(validateChapterCreateInput({
            ...validChapter,
            chapter_subtitle: "<script>bad()</script>"
        })).toEqual({
            valid: false,
            message: "chapter_subtitle cannot be empty or strings containing security-sensitive characters"
        });

        expect(validateChapterCreateInput({
            ...validChapter,
            chapter_content: "<script>bad()</script>"
        })).toEqual({
            valid: false,
            message: "chapter_content cannot be empty or strings containing security-sensitive characters"
        });

        expect(validateChapterCreateInput({
            ...validChapter,
            chapter_order: -1
        })).toEqual({
            valid: false,
            message: "chapter_order must be a non-negative number"
        });
    });

    it("validates partial update input", () => {
        expect(validateChapterUpdateInput({
            chapter_subtitle: "Updated",
            chapter_content: "Updated body",
            chapter_order: 2
        })).toEqual({
            valid: true,
            updates: {
                chapter_subtitle: "Updated",
                waiting_for_approve_content: "Updated body",
                chapter_order: 2
            }
        });
    });

    it("keeps existing update behavior for empty subtitle/content but rejects empty name", () => {
        expect(validateChapterUpdateInput({ chapter_subtitle: "<script>bad()</script>" })).toEqual({
            valid: true,
            updates: { chapter_subtitle: "" }
        });

        expect(validateChapterUpdateInput({ chapter_content: "<script>bad()</script>" })).toEqual({
            valid: true,
            updates: { waiting_for_approve_content: "" }
        });

        expect(validateChapterUpdateInput({ chapter_name: "<script>bad()</script>" })).toEqual({
            valid: false,
            message: "Chapter name cannot be empty."
        });
    });

    it("rejects empty updates and invalid update order", () => {
        expect(validateChapterUpdateInput({})).toEqual({
            valid: false,
            message: "No valid fields provided for update."
        });

        expect(validateChapterUpdateInput({ chapter_order: -1 })).toEqual({
            valid: false,
            message: "chapter_order must be a non-negative number."
        });
    });
});
