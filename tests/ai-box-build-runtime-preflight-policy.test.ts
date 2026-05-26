import { describe, expect, it } from "vitest";
import {
    buildAIBoxRuntimePreflightFailureMessage,
    buildOpencodePreflightError,
    buildSshpassPreflightError,
    shouldCheckSshpassForAIBoxRun,
    validateAIBoxRuntimeConfig
} from "../src/modules/ai-box-build/AIBoxBuildRuntimePreflightPolicy";

describe("AIBoxBuildRuntimePreflightPolicy", () => {
    it("reports missing OpenAI-compatible runtime config", () => {
        expect(validateAIBoxRuntimeConfig({})).toEqual([
            "OPENAI_API_KEY is not configured",
            "OPENAI_BASE_URL is not configured"
        ]);
        expect(validateAIBoxRuntimeConfig({
            openAIApiKey: "key",
            openAIBaseUrl: "https://ai.example.test/v1"
        })).toEqual([]);
    });

    it("skips sshpass only for dry runs", () => {
        expect(shouldCheckSshpassForAIBoxRun(true)).toBe(false);
        expect(shouldCheckSshpassForAIBoxRun(false)).toBe(true);
        expect(shouldCheckSshpassForAIBoxRun(undefined)).toBe(true);
    });

    it("builds command preflight error messages", () => {
        expect(buildOpencodePreflightError("/usr/local/bin/opencode", "exit=127")).toBe(
            "opencode is not executable at /usr/local/bin/opencode: exit=127"
        );
        expect(buildSshpassPreflightError("command not found")).toBe(
            "sshpass is required for SSH setup execution: command not found"
        );
    });

    it("builds the aggregate preflight failure message", () => {
        expect(buildAIBoxRuntimePreflightFailureMessage(["one", "two"])).toBe(
            "AI build runtime preflight failed: one; two"
        );
    });
});
