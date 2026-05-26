import { describe, expect, it } from "vitest";
import {
    classifyRegistrationConflict,
    collectMissingRegistrationFields
} from "../src/modules/auth/AuthRegistrationPolicy";

describe("AuthRegistrationPolicy", () => {
    it("collects missing registration fields in response-message order", () => {
        expect(collectMissingRegistrationFields({})).toEqual(["username", "email", "password"]);
        expect(collectMissingRegistrationFields({
            username: "alice",
            email: "",
            password: "secret"
        })).toEqual(["email"]);
    });

    it("prioritizes existing unverified email conflicts", () => {
        expect(classifyRegistrationConflict([
            { username: "other", email: "alice@example.test", isVerified: false },
            { username: "alice", email: "other@example.test", isVerified: true }
        ], {
            username: "alice",
            email: "alice@example.test"
        })).toEqual({
            conflict: true,
            reason: "unverified_email"
        });
    });

    it("classifies existing username or verified email as blocked identity", () => {
        expect(classifyRegistrationConflict([
            { username: "alice", email: "alice-old@example.test", isVerified: true }
        ], {
            username: "alice",
            email: "new@example.test"
        })).toEqual({
            conflict: true,
            reason: "existing_identity"
        });

        expect(classifyRegistrationConflict([
            { username: "other", email: "alice@example.test", isVerified: true }
        ], {
            username: "alice",
            email: "alice@example.test"
        })).toEqual({
            conflict: true,
            reason: "existing_identity"
        });
    });

    it("allows registration when no matching username or email exists", () => {
        expect(classifyRegistrationConflict([
            { username: "other", email: "other@example.test", isVerified: true }
        ], {
            username: "alice",
            email: "alice@example.test"
        })).toEqual({ conflict: false });
    });
});
