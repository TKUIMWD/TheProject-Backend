import { describe, expect, it } from "vitest";
import { OpenAICompatibleChatClient } from "../src/modules/openai/OpenAICompatibleChatClient";

const config = {
    apiKey: "key",
    baseUrl: "https://openai-compatible.test/v1/",
    model: "fallback-model",
    boxBuildModel: "box-model",
    boxBuildModels: ["first-model", "box-model"],
    boxBuildMaxTokens: 1234,
    boxBuildTimeoutMs: 1000
};

describe("OpenAICompatibleChatClient", () => {
    it("builds distinct model candidates in fallback order", () => {
        const client = new OpenAICompatibleChatClient(config, fetch);

        expect(client.modelCandidates()).toEqual([
            "first-model",
            "box-model",
            "fallback-model",
            "gpt-4o"
        ]);
    });

    it("sends OpenAI-compatible JSON chat completion requests", async () => {
        const calls: Array<{ url: string; init?: RequestInit }> = [];
        const requester = async (input: string | URL | Request, init?: RequestInit) => {
            calls.push({ url: String(input), init });
            return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 });
        };
        const client = new OpenAICompatibleChatClient(config, requester as typeof fetch);

        const raw = await client.createJsonChatCompletion([
            { role: "user", content: "hello" }
        ], "first-model");

        expect(raw).toContain("choices");
        expect(calls[0].url).toBe("https://openai-compatible.test/v1/chat/completions");
        expect(calls[0].init?.method).toBe("POST");
        expect(calls[0].init?.headers).toMatchObject({
            Authorization: "Bearer key",
            "Content-Type": "application/json"
        });
        expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({
            model: "first-model",
            max_completion_tokens: 1234,
            response_format: { type: "json_object" }
        });
    });

    it("reports non-2xx responses with status and response excerpt", async () => {
        const requester = async () => new Response("bad request details", { status: 400 });
        const client = new OpenAICompatibleChatClient(config, requester as typeof fetch);

        await expect(client.createJsonChatCompletion([], "first-model"))
            .rejects
            .toThrow("AI service returned 400: bad request details");
    });
});
