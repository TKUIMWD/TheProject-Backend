import { describe, expect, it } from "vitest";
import { AuthForgotPasswordService } from "../src/modules/auth/AuthForgotPasswordService";

const now = new Date("2026-05-26T10:00:00.000Z");

function makeUser(overrides: Record<string, unknown> = {}) {
    return {
        _id: "507f1f77bcf86cd799439051",
        username: "alice",
        email: "alice@example.com",
        password_hash: "old-hash",
        lastTimePasswordResetEmailSent: undefined,
        saveCount: 0,
        async save() {
            this.saveCount += 1;
            return this;
        },
        ...overrides
    } as any;
}

function makeService(options: {
    user?: any | null;
    passwordValid?: boolean;
    missingRequirements?: string[];
    verifyResult?: unknown;
    verifyError?: Error;
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const user = options.user === undefined ? makeUser() : options.user;

    const service = new AuthForgotPasswordService({
        userRepo: {
            findByEmail: async (email) => {
                calls.push({ method: "findByEmail", args: [email] });
                return user;
            }
        },
        checkPasswordStrength: (password) => {
            calls.push({ method: "checkPasswordStrength", args: [password] });
            return {
                isValid: options.passwordValid !== false,
                missingRequirements: options.missingRequirements ?? []
            };
        },
        hashPassword: async (password) => {
            calls.push({ method: "hashPassword", args: [password] });
            return `hashed:${password}`;
        },
        generateResetToken: (email) => {
            calls.push({ method: "generateResetToken", args: [email] });
            return "reset-token";
        },
        verifyResetToken: (token) => {
            calls.push({ method: "verifyResetToken", args: [token] });
            if (options.verifyError) throw options.verifyError;
            return options.verifyResult ?? { email: "alice@example.com" };
        },
        sendResetEmail: (email, token) => {
            calls.push({ method: "sendResetEmail", args: [email, token] });
        },
        now: () => now
    });

    return { calls, service, user };
}

describe("AuthForgotPasswordService", () => {
    it("rejects missing email before repository calls", async () => {
        const { service, calls } = makeService();

        await expect(service.handle({
            method: "POST",
            body: {}
        })).resolves.toMatchObject({
            code: 400,
            message: "missing email field"
        });
        expect(calls).toEqual([]);
    });

    it("returns the privacy response for unknown emails", async () => {
        const { service, calls } = makeService({ user: null });

        await expect(service.handle({
            method: "POST",
            body: { email: "missing@example.com" }
        })).resolves.toMatchObject({
            code: 200,
            message: "If the email exists, a password reset email has been sent"
        });
        expect(calls).toEqual([
            { method: "findByEmail", args: ["missing@example.com"] }
        ]);
    });

    it("sends a reset email when the throttle window allows it", async () => {
        const { service, calls, user } = makeService();

        await expect(service.handle({
            method: "POST",
            body: { email: "alice@example.com" }
        })).resolves.toMatchObject({
            code: 200,
            message: "password reset email sent"
        });

        expect(user.lastTimePasswordResetEmailSent).toEqual(now);
        expect(user.saveCount).toBe(1);
        expect(calls).toContainEqual({ method: "generateResetToken", args: ["alice@example.com"] });
        expect(calls).toContainEqual({ method: "sendResetEmail", args: ["alice@example.com", "reset-token"] });
    });

    it("returns the resend throttle response inside the email window", async () => {
        const recentSend = new Date(now.getTime() - 2 * 60 * 1000);
        const { service, calls } = makeService({
            user: makeUser({ lastTimePasswordResetEmailSent: recentSend })
        });

        await expect(service.handle({
            method: "POST",
            body: { email: "alice@example.com" }
        })).resolves.toMatchObject({
            code: 400,
            message: "please wait 3 minute(s) before resending the verification email"
        });
        expect(calls.some((call) => call.method === "sendResetEmail")).toBe(false);
    });

    it("returns token validation errors before password validation", async () => {
        const { service, calls } = makeService({ verifyError: new Error("token expired") });

        await expect(service.handle({
            method: "PUT",
            authorizationHeader: "Bearer expired-token",
            body: { password: "StrongPass1!" }
        })).resolves.toMatchObject({
            code: 401,
            message: "token expired"
        });
        expect(calls).toEqual([
            { method: "verifyResetToken", args: ["expired-token"] }
        ]);
    });

    it("rejects missing reset password after a valid token", async () => {
        const { service, calls } = makeService();

        await expect(service.handle({
            method: "PUT",
            authorizationHeader: "Bearer reset-token",
            body: {}
        })).resolves.toMatchObject({
            code: 400,
            message: "missing password field"
        });
        expect(calls).toEqual([
            { method: "verifyResetToken", args: ["reset-token"] },
            { method: "findByEmail", args: ["alice@example.com"] }
        ]);
    });

    it("rejects weak reset passwords before hashing", async () => {
        const { service, calls } = makeService({
            passwordValid: false,
            missingRequirements: ["uppercase", "number"]
        });

        await expect(service.handle({
            method: "PUT",
            authorizationHeader: "Bearer reset-token",
            body: { password: "weak" }
        })).resolves.toMatchObject({
            code: 400,
            message: "password does not meet the requirements: uppercase, number"
        });
        expect(calls).toEqual([
            { method: "verifyResetToken", args: ["reset-token"] },
            { method: "findByEmail", args: ["alice@example.com"] },
            { method: "checkPasswordStrength", args: ["weak"] }
        ]);
    });

    it("updates the stored password hash on successful reset", async () => {
        const { service, calls, user } = makeService();

        await expect(service.handle({
            method: "PUT",
            authorizationHeader: "Bearer reset-token",
            body: { password: "StrongPass1!" }
        })).resolves.toMatchObject({
            code: 200,
            message: "password reset successful"
        });

        expect(user.password_hash).toBe("hashed:StrongPass1!");
        expect(user.saveCount).toBe(1);
        expect(calls).toContainEqual({ method: "hashPassword", args: ["StrongPass1!"] });
    });

    it("keeps the invalid method response in the workflow", async () => {
        const { service, calls } = makeService();

        await expect(service.handle({
            method: "PATCH",
            body: {}
        })).resolves.toMatchObject({
            code: 400,
            message: "invalid method"
        });
        expect(calls).toEqual([]);
    });
});
