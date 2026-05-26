import { describe, expect, it } from "vitest";
import { AuthSessionService } from "../src/modules/auth/AuthSessionService";

function makeUser(overrides: Record<string, unknown> = {}) {
    return {
        email: "alice@example.com",
        username: "alice",
        isVerified: false,
        saveCount: 0,
        async save() {
            this.saveCount += 1;
            return this;
        },
        ...overrides
    } as any;
}

describe("AuthSessionService", () => {
    it("marks an authenticated user as verified", async () => {
        const user = makeUser();
        const service = new AuthSessionService();

        await expect(service.verifyEmail(user)).resolves.toMatchObject({
            code: 200,
            message: "email verified successfully"
        });

        expect(user.isVerified).toBe(true);
        expect(user.saveCount).toBe(1);
    });

    it("keeps the verify success response when no user is supplied", async () => {
        const service = new AuthSessionService();

        await expect(service.verifyEmail(undefined)).resolves.toMatchObject({
            code: 200,
            message: "email verified successfully"
        });
    });

    it("returns the logout success response for authenticated users", async () => {
        const service = new AuthSessionService();

        await expect(service.logout(makeUser())).resolves.toMatchObject({
            code: 200,
            message: "logout successful"
        });
    });

    it("keeps the logout success response when no user is supplied", async () => {
        const service = new AuthSessionService();

        await expect(service.logout(null)).resolves.toMatchObject({
            code: 200,
            message: "logout successful"
        });
    });
});
