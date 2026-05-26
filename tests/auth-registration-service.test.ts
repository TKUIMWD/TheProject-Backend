import { describe, expect, it } from "vitest";
import { AuthRegistrationService } from "../src/modules/auth/AuthRegistrationService";

const userId = "507f1f77bcf86cd799439052";
const standardPlan = { _id: "standard-plan-1", name: "standard" };
const now = new Date("2026-05-26T10:00:00.000Z");

type RegistrationUser = {
    _id: string;
    username: string;
    email: string;
    lastTimeVerifyEmailSent?: Date;
    saveCount: number;
    save(): Promise<RegistrationUser>;
    [key: string]: unknown;
};

function makeRegistrationUser(input: Record<string, unknown> = {}): RegistrationUser {
    return {
        _id: userId,
        username: "alice",
        email: "alice@example.com",
        saveCount: 0,
        async save() {
            this.saveCount += 1;
            return this;
        },
        ...input
    } as RegistrationUser;
}

function makeService(options: {
    existingUsers?: any[];
    standardPlan?: any | null;
    passwordValid?: boolean;
    missingRequirements?: string[];
    user?: RegistrationUser;
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    let createdUser = options.user;

    const service = new AuthRegistrationService({
        repo: {
            listConflictingUsers: async (username, email) => {
                calls.push({ method: "listConflictingUsers", args: [username, email] });
                return options.existingUsers ?? [];
            },
            findStandardComputeResourcePlan: async () => {
                calls.push({ method: "findStandardComputeResourcePlan", args: [] });
                return options.standardPlan === undefined ? standardPlan as any : options.standardPlan;
            },
            createUser: (payload) => {
                calls.push({ method: "createUser", args: [payload] });
                createdUser = options.user ?? makeRegistrationUser(payload);
                Object.assign(createdUser, payload);
                return createdUser;
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
        generateToken: (id) => {
            calls.push({ method: "generateToken", args: [id] });
            return "verify-token";
        },
        sendVerification: (email, token) => {
            calls.push({ method: "sendVerification", args: [email, token] });
        },
        now: () => now
    });

    return {
        calls,
        service,
        get createdUser() {
            return createdUser;
        }
    };
}

describe("AuthRegistrationService", () => {
    it("rejects missing fields before repository calls", async () => {
        const { service, calls } = makeService();

        await expect(service.register({ email: "", password: "" } as any)).resolves.toMatchObject({
            code: 400,
            message: "missing required fields: username, email, password"
        });
        expect(calls).toEqual([]);
    });

    it("rejects existing verified username or email conflicts", async () => {
        const { service, calls } = makeService({
            existingUsers: [{ username: "alice", email: "old@example.com", isVerified: true }]
        });

        await expect(service.register({
            username: "alice",
            email: "alice@example.com",
            password: "StrongPass1!"
        })).resolves.toMatchObject({
            code: 400,
            message: "cannot register"
        });
        expect(calls).toEqual([
            { method: "listConflictingUsers", args: ["alice", "alice@example.com"] }
        ]);
    });

    it("keeps the unverified email response for pending accounts", async () => {
        const { service } = makeService({
            existingUsers: [{ username: "other", email: "alice@example.com", isVerified: false }]
        });

        await expect(service.register({
            username: "alice",
            email: "alice@example.com",
            password: "StrongPass1!"
        })).resolves.toMatchObject({
            code: 400,
            message: "email already exists but not verified , please verify your email"
        });
    });

    it("rejects weak passwords before hashing or plan lookup", async () => {
        const { service, calls } = makeService({
            passwordValid: false,
            missingRequirements: ["uppercase", "number"]
        });

        await expect(service.register({
            username: "alice",
            email: "alice@example.com",
            password: "weak"
        })).resolves.toMatchObject({
            code: 400,
            message: "password does not meet the requirements: uppercase, number"
        });
        expect(calls).toEqual([
            { method: "listConflictingUsers", args: ["alice", "alice@example.com"] },
            { method: "checkPasswordStrength", args: ["weak"] }
        ]);
    });

    it("returns the standard plan error when the default plan is unavailable", async () => {
        const { service, calls } = makeService({ standardPlan: null });

        await expect(service.register({
            username: "alice",
            email: "alice@example.com",
            password: "StrongPass1!"
        })).resolves.toMatchObject({
            code: 500,
            message: "Default compute resource plan not available"
        });
        expect(calls).toEqual([
            { method: "listConflictingUsers", args: ["alice", "alice@example.com"] },
            { method: "checkPasswordStrength", args: ["StrongPass1!"] },
            { method: "hashPassword", args: ["StrongPass1!"] },
            { method: "findStandardComputeResourcePlan", args: [] }
        ]);
    });

    it("creates a user, assigns the standard plan, and sends verification", async () => {
        const context = makeService();

        await expect(context.service.register({
            username: "alice",
            email: "alice@example.com",
            password: "StrongPass1!"
        })).resolves.toMatchObject({
            code: 200,
            message: "user registered successfully"
        });

        expect(context.createdUser?.saveCount).toBe(2);
        expect(context.createdUser?.lastTimeVerifyEmailSent).toEqual(now);
        expect(context.calls).toContainEqual({ method: "generateToken", args: [userId] });
        expect(context.calls).toContainEqual({ method: "sendVerification", args: ["alice@example.com", "verify-token"] });
        expect(context.calls).toContainEqual({
            method: "createUser",
            args: [{
                username: "alice",
                password_hash: "hashed:StrongPass1!",
                email: "alice@example.com",
                isVerified: false,
                registeredAt: now,
                compute_resource_plan_id: "standard-plan-1"
            }]
        });
    });

    it("returns the resend throttle message when the new user is still inside the email window", async () => {
        const recentSend = new Date(now.getTime() - 2 * 60 * 1000);
        const throttledUser = makeRegistrationUser({ lastTimeVerifyEmailSent: recentSend });
        const { service, calls } = makeService({ user: throttledUser });

        await expect(service.register({
            username: "alice",
            email: "alice@example.com",
            password: "StrongPass1!"
        })).resolves.toMatchObject({
            code: 400,
            message: "please wait 3 minute(s) before resending the verification email"
        });
        expect(calls.some((call) => call.method === "sendVerification")).toBe(false);
    });

    it("allows email when the interval boundary has elapsed", () => {
        const { service } = makeService();
        const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
        const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);

        expect(service.canSendEmail(undefined, 5)).toBe(true);
        expect(service.canSendEmail(fiveMinutesAgo, 5)).toBe(true);
        expect(service.canSendEmail(oneMinuteAgo, 5)).toBe(false);
    });
});
