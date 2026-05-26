import { describe, expect, it } from "vitest";
import { validateTokenUserId } from "../src/modules/auth/AuthTokenPolicy";

describe("validateTokenUserId", () => {
    it("normalizes valid token user IDs", () => {
        expect(validateTokenUserId(" 507f1f77bcf86cd799439011 ")).toEqual({
            valid: true,
            userId: "507f1f77bcf86cd799439011"
        });
    });

    it("rejects missing or invalid token user IDs as invalid tokens", () => {
        expect(validateTokenUserId(undefined)).toEqual({ valid: false, message: "invalid token" });
        expect(validateTokenUserId("bad-id")).toEqual({ valid: false, message: "invalid token" });
    });
});

