import { describe, expect, it } from "vitest";
import {
    buildAIBoxOpenCodeRunPrompt,
    buildAIBoxWorkspaceAgentInstructions,
    buildOpenCodeConfig,
    normalizeOpenCodeConfigModelId,
    normalizeOpenCodeRunModel
} from "../src/modules/ai-box-build/AIBoxBuildOpenCodePolicy";

describe("AIBoxBuildOpenCodePolicy", () => {
    it("prefixes run models with the default provider when needed", () => {
        expect(normalizeOpenCodeRunModel("gpt-5-mini")).toBe("cstg/gpt-5-mini");
        expect(normalizeOpenCodeRunModel("custom/gpt-5-mini")).toBe("custom/gpt-5-mini");
    });

    it("derives config model IDs from provider-qualified models", () => {
        expect(normalizeOpenCodeConfigModelId("cstg/gpt-5-mini")).toBe("gpt-5-mini");
        expect(normalizeOpenCodeConfigModelId("openai/reasoning/gpt-5")).toBe("reasoning/gpt-5");
        expect(normalizeOpenCodeConfigModelId("gpt-5-mini")).toBe("gpt-5-mini");
    });

    it("builds an OpenCode config for the compatible provider", () => {
        const config = JSON.parse(buildOpenCodeConfig({
            rawModel: "cstg/gpt-5-mini",
            baseUrl: "https://ai.example.test/v1"
        }));

        expect(config.$schema).toBe("https://opencode.ai/config.json");
        expect(config.provider.cstg.npm).toBe("@ai-sdk/openai-compatible");
        expect(config.provider.cstg.options).toEqual({
            baseURL: "https://ai.example.test/v1",
            apiKey: "{env:OPENAI_API_KEY}"
        });
        expect(config.provider.cstg.models["gpt-5-mini"]).toEqual({ name: "gpt-5-mini" });
    });

    it("supports custom provider metadata", () => {
        const config = JSON.parse(buildOpenCodeConfig({
            rawModel: "model-a",
            baseUrl: "https://ai.example.test/v1",
            providerKey: "local",
            providerName: "Local AI",
            apiKeyEnvRef: "{env:LOCAL_AI_KEY}"
        }));

        expect(config.provider.local.name).toBe("Local AI");
        expect(config.provider.local.options.apiKey).toBe("{env:LOCAL_AI_KEY}");
        expect(config.provider.local.models["model-a"]).toEqual({ name: "model-a" });
    });

    it("builds workspace AGENTS instructions with required safety boundaries", () => {
        const instructions = buildAIBoxWorkspaceAgentInstructions();

        expect(instructions).toContain("Work only inside this workspace");
        expect(instructions).toContain("Do not SSH into the VM directly");
        expect(instructions).toContain("Keep design.md confidential");
        expect(instructions).toContain("generated/setup.sh");
        expect(instructions).toContain("Do not place SSH passwords or API keys in files");
    });

    it("builds opencode run prompts with VM context and required output files", () => {
        const prompt = buildAIBoxOpenCodeRunPrompt({
            latestUbuntuServer: "Ubuntu Server 26.04 LTS",
            pveNode: "pve-a",
            pveVmid: "120",
            vmIp: "10.10.10.20",
            sshUser: "student"
        });

        expect(prompt).toContain("PVE: pve-a/120");
        expect(prompt).toContain("IP: 10.10.10.20");
        expect(prompt).toContain("SSH user: student");
        expect(prompt).toContain("Ubuntu Server 26.04 LTS");
        expect(prompt).toContain("generated/setup.sh");
        expect(prompt).toContain("generated/validation.sh");
        expect(prompt).toContain("validation.sh must exit non-zero");
    });

    it("builds dry-run opencode prompts with fallback SSH user", () => {
        const prompt = buildAIBoxOpenCodeRunPrompt({
            latestUbuntuServer: "Ubuntu Server 26.04 LTS",
            fallbackSshUser: "root"
        });

        expect(prompt).toContain("PVE: dry-run/dry-run");
        expect(prompt).toContain("IP: dry-run");
        expect(prompt).toContain("SSH user: root");
    });
});
