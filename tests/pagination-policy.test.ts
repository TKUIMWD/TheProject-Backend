import { describe, expect, it } from "vitest";
import { validatePaginationInput } from "../src/modules/common/PaginationPolicy";

describe("validatePaginationInput", () => {
    it("uses defaults when pagination is omitted", () => {
        expect(validatePaginationInput({})).toEqual({
            valid: true,
            page: 1,
            limit: 10,
            skip: 0
        });
    });

    it("parses positive integer strings", () => {
        expect(validatePaginationInput({ page: "3", limit: "20" })).toEqual({
            valid: true,
            page: 3,
            limit: 20,
            skip: 40
        });
    });

    it("rejects invalid page and limit values", () => {
        expect(validatePaginationInput({ page: "0" })).toEqual({
            valid: false,
            message: "page must be a positive integer"
        });
        expect(validatePaginationInput({ limit: "-1" })).toEqual({
            valid: false,
            message: "limit must be a positive integer"
        });
    });

    it("caps maximum limit", () => {
        expect(validatePaginationInput({ limit: "101" }, { maxLimit: 100 })).toEqual({
            valid: false,
            message: "limit must be less than or equal to 100"
        });
    });
});

