import { describe, expect, it } from "vitest";
import { AuthService } from "../src/service/AuthService";

const user = {
    username: "alice",
    isVerified: false,
    save: async () => undefined
};

function makeService() {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const service = new AuthService({
        registration: {
            canSendEmail: (lastTimeSent, intervalMinutes) => {
                calls.push({ method: "canSendEmail", args: [lastTimeSent, intervalMinutes] });
                return true;
            },
            register: async (data) => {
                calls.push({ method: "register", args: [data] });
                return { code: 200, message: "registered", body: undefined };
            }
        },
        login: {
            login: async (data) => {
                calls.push({ method: "login", args: [data] });
                return { code: 200, message: "login", body: { token: "token" } };
            }
        },
        session: {
            verifyEmail: async (inputUser) => {
                calls.push({ method: "verifyEmail", args: [inputUser] });
                return { code: 200, message: "verified", body: undefined };
            },
            logout: async (inputUser) => {
                calls.push({ method: "logout", args: [inputUser] });
                return { code: 200, message: "logout", body: undefined };
            }
        },
        forgotPassword: {
            handle: async (input) => {
                calls.push({ method: "forgotPassword", args: [input] });
                return { code: 200, message: "forgot", body: undefined };
            }
        }
    });

    return { calls, service };
}

describe("AuthService", () => {
    it("delegates auth DTO inputs without Express request coupling", async () => {
        const { calls, service } = makeService();
        const registerInput = { username: "alice", email: "alice@example.com", password: "Secret123!" };
        const loginInput = { email: "alice@example.com", password: "Secret123!" };
        const forgotInput = {
            method: "POST",
            body: { email: "alice@example.com" },
            authorizationHeader: "Bearer token"
        };

        expect(service.canSendEmail(null, 5)).toBe(true);
        await expect(service.register(registerInput)).resolves.toMatchObject({ message: "registered" });
        await expect(service.login(loginInput)).resolves.toMatchObject({ message: "login" });
        await expect(service.verify(user)).resolves.toMatchObject({ message: "verified" });
        await expect(service.logout(user)).resolves.toMatchObject({ message: "logout" });
        await expect(service.forgotPassword(forgotInput)).resolves.toMatchObject({ message: "forgot" });

        expect(calls).toEqual([
            { method: "canSendEmail", args: [null, 5] },
            { method: "register", args: [registerInput] },
            { method: "login", args: [loginInput] },
            { method: "verifyEmail", args: [user] },
            { method: "logout", args: [user] },
            { method: "forgotPassword", args: [forgotInput] }
        ]);
    });
});
