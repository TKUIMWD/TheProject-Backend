import { describe, expect, it } from "vitest";
import Roles from "../src/enum/role";
import { AuthLoginService } from "../src/modules/auth/AuthLoginService";

const userId = "507f1f77bcf86cd799439051";
const now = new Date("2026-05-26T10:00:00.000Z");

function makeUser(overrides: Record<string, unknown> = {}) {
    return {
        _id: userId,
        username: "alice",
        email: "alice@example.com",
        role: Roles.User,
        password_hash: "hashed",
        isVerified: true,
        wrongLoginAttemptId: undefined,
        lastTimeVerifyEmailSent: undefined,
        isLocked: false,
        save: async function () {
            return this;
        },
        ...overrides
    } as any;
}

function makeWrongAttempt(overrides: Record<string, unknown> = {}) {
    return {
        _id: "attempt-1",
        user_id: userId,
        wrongLoginAttemptStartTime: now,
        wrongLoginAttemptCount: 1,
        lockUntil: undefined,
        save: async function () {
            return this;
        },
        ...overrides
    } as any;
}

function makeService(options: {
    user?: any | null;
    wrongAttempt?: any | null;
    passwordMatches?: boolean;
    canSendEmail?: boolean;
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    let wrongAttempt = options.wrongAttempt === undefined ? null : options.wrongAttempt;
    const service = new AuthLoginService({
        userRepo: {
            findByEmail: async (email) => {
                calls.push({ method: "findByEmail", args: [email] });
                return options.user === undefined ? makeUser() : options.user;
            }
        },
        wrongAttemptRepo: {
            findByUserId: async (id) => {
                calls.push({ method: "findWrongAttemptByUserId", args: [id] });
                return wrongAttempt;
            },
            create: (payload) => {
                calls.push({ method: "createWrongAttempt", args: [payload] });
                wrongAttempt = makeWrongAttempt(payload);
                return wrongAttempt;
            },
            deleteByUserId: async (id) => {
                calls.push({ method: "deleteWrongAttemptByUserId", args: [id] });
                wrongAttempt = null;
            }
        },
        comparePassword: async (password, hash) => {
            calls.push({ method: "comparePassword", args: [password, hash] });
            return options.passwordMatches !== false;
        },
        generateAuthToken: (id, role, username) => {
            calls.push({ method: "generateAuthToken", args: [id, role, username] });
            return "token-1";
        },
        generateEmailVerificationToken: (id) => {
            calls.push({ method: "generateEmailVerificationToken", args: [id] });
            return "verify-token";
        },
        sendVerificationEmail: (email, token) => {
            calls.push({ method: "sendVerificationEmail", args: [email, token] });
        },
        canSendEmail: () => options.canSendEmail !== false,
        now: () => now
    });

    return { calls, service };
}

describe("AuthLoginService", () => {
    it("rejects missing login fields", async () => {
        const { service, calls } = makeService();

        await expect(service.login({ email: "" })).resolves.toMatchObject({
            code: 400,
            message: "missing required fields: email, password"
        });
        expect(calls).toEqual([]);
    });

    it("rejects invalid email or password for unknown users", async () => {
        const { service, calls } = makeService({ user: null });

        await expect(service.login({
            email: "missing@example.com",
            password: "secret"
        })).resolves.toMatchObject({
            code: 400,
            message: "invalid email or password"
        });
        expect(calls).toEqual([
            { method: "findByEmail", args: ["missing@example.com"] }
        ]);
    });

    it("resends verification email for unverified users when allowed", async () => {
        const user = makeUser({ isVerified: false });
        const { service, calls } = makeService({ user });

        await expect(service.login({
            email: "alice@example.com",
            password: "secret"
        })).resolves.toMatchObject({
            code: 400,
            message: "email not verified, please verify your email"
        });

        expect(user.lastTimeVerifyEmailSent).toEqual(now);
        expect(calls).toContainEqual({ method: "sendVerificationEmail", args: ["alice@example.com", "verify-token"] });
        expect(calls.some((call) => call.method === "comparePassword")).toBe(false);
    });

    it("records wrong login attempts for invalid passwords", async () => {
        const user = makeUser();
        const { service, calls } = makeService({
            user,
            passwordMatches: false
        });

        await expect(service.login({
            email: "alice@example.com",
            password: "bad"
        })).resolves.toMatchObject({
            code: 400,
            message: "invalid email or password"
        });

        expect(calls.some((call) => call.method === "createWrongAttempt")).toBe(true);
        expect(user.wrongLoginAttemptId).toBe("attempt-1");
    });

    it("returns locked response when a wrong attempt is still locked", async () => {
        const lockUntil = new Date(now.getTime() + 5 * 60 * 1000);
        const { service } = makeService({
            user: makeUser({ wrongLoginAttemptId: "attempt-1" }),
            wrongAttempt: makeWrongAttempt({ lockUntil })
        });

        await expect(service.login({
            email: "alice@example.com",
            password: "secret"
        })).resolves.toMatchObject({
            code: 400,
            message: "user is locked, please wait 5 minute(s) until the lock is lifted"
        });
    });

    it("clears wrong attempts and returns token on successful login", async () => {
        const user = makeUser({ wrongLoginAttemptId: "attempt-1", isLocked: true });
        const { service, calls } = makeService({
            user,
            wrongAttempt: makeWrongAttempt()
        });

        await expect(service.login({
            email: "alice@example.com",
            password: "secret"
        })).resolves.toEqual({
            code: 200,
            message: "login successful",
            body: { token: "token-1" }
        });

        expect(user.isLocked).toBe(false);
        expect(user.wrongLoginAttemptId).toBeUndefined();
        expect(calls).toContainEqual({ method: "deleteWrongAttemptByUserId", args: [userId] });
        expect(calls).toContainEqual({ method: "generateAuthToken", args: [userId, Roles.User, "alice"] });
    });
});
