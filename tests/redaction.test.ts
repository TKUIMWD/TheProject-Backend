import { describe, expect, it } from "vitest";
import { env, redactSecret } from "../src/config/env";

describe("redactSecret", () => {
    it("redacts configured secrets and URL tokens", () => {
        const sensitive = `mongodb password ${env.database.password} token=https://example.test/#/?token=abc123`;
        const redacted = redactSecret(sensitive);

        expect(redacted).not.toContain(env.database.password);
        expect(redacted).toContain("[redacted]");
        expect(redacted).toContain("token=[redacted]");
    });

    it("redacts password-like key value pairs", () => {
        expect(redactSecret("cipassword=super-secret-value")).toBe("cipassword=[redacted]");
        expect(redactSecret("SSHPASS: another-secret")).toBe("SSHPASS=[redacted]");
    });
});
