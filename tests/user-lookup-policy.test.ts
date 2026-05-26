import { describe, expect, it } from "vitest";
import { validateUserLookupId } from "../src/modules/users/UserLookupPolicy";

describe("validateUserLookupId", () => {
    it("normalizes valid user lookup IDs", () => {
        expect(validateUserLookupId(" 507f1f77bcf86cd799439011 ")).toEqual({
            valid: true,
            userId: "507f1f77bcf86cd799439011"
        });
    });

    it("rejects missing or invalid user lookup IDs", () => {
        expect(validateUserLookupId(undefined)).toEqual({
            valid: false,
            message: "Invalid user_id format"
        });
        expect(validateUserLookupId("not-an-id")).toEqual({
            valid: false,
            message: "Invalid user_id format"
        });
    });
});
