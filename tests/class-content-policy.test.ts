import { describe, expect, it } from "vitest";
import {
    validateClassCreateInput,
    validateClassUpdateInput
} from "../src/modules/courses/ClassContentPolicy";

const validClass = {
    class_name: "  <b>Intro</b>  ",
    class_subtitle: "Getting started",
    class_order: 0
};

describe("ClassContentPolicy", () => {
    it("validates and sanitizes create input", () => {
        expect(validateClassCreateInput(validClass)).toEqual({
            valid: true,
            fields: {
                class_name: "  <b>Intro</b>  ",
                class_subtitle: "Getting started",
                class_order: 0
            }
        });
    });

    it("reports missing create fields", () => {
        expect(validateClassCreateInput({ class_name: "Intro" })).toEqual({
            valid: false,
            message: "Missing required fields: class_subtitle, class_order"
        });
    });

    it("rejects unsafe or invalid create fields", () => {
        expect(validateClassCreateInput({
            ...validClass,
            class_name: "<script>bad()</script>"
        })).toEqual({
            valid: false,
            message: "class_name cannot be empty or strings containing security-sensitive characters"
        });

        expect(validateClassCreateInput({
            ...validClass,
            class_order: -1
        })).toEqual({
            valid: false,
            message: "class_order must be a non-negative number"
        });
    });

    it("validates partial update input", () => {
        expect(validateClassUpdateInput({
            class_subtitle: "Updated",
            class_order: 2
        })).toEqual({
            valid: true,
            updates: {
                class_subtitle: "Updated",
                class_order: 2
            }
        });
    });

    it("rejects empty updates", () => {
        expect(validateClassUpdateInput({})).toEqual({
            valid: false,
            message: "No valid fields to update"
        });
    });
});
