import { describe, expect, it } from "vitest";
import { validateObjectIdInput } from "../src/modules/common/ObjectIdPolicy";

describe("validateObjectIdInput", () => {
    it("rejects missing IDs", () => {
        expect(validateObjectIdInput(undefined, "resource_id")).toEqual({
            valid: false,
            message: "resource_id is required"
        });
        expect(validateObjectIdInput("", "resource_id")).toEqual({
            valid: false,
            message: "resource_id is required"
        });
    });

    it("rejects invalid ObjectId values", () => {
        expect(validateObjectIdInput("not-an-id", "resource_id")).toEqual({
            valid: false,
            message: "Invalid resource_id format"
        });
    });

    it("normalizes valid ObjectId values", () => {
        expect(validateObjectIdInput(" 507f1f77bcf86cd799439011 ", "resource_id")).toEqual({
            valid: true,
            value: "507f1f77bcf86cd799439011"
        });
    });
});

