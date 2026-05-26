import { describe, expect, it } from "vitest";
import { OpenAIClientFactory } from "../src/modules/openai/OpenAIClientFactory";

describe("OpenAIClientFactory", () => {
    it("creates chat clients from typed OpenAI config", () => {
        const calls: Record<string, unknown>[] = [];
        class FakeOpenAI {
            constructor(options: Record<string, unknown>) {
                calls.push(options);
            }
        }

        const factory = new OpenAIClientFactory(
            {
                apiKey: "key",
                baseUrl: "https://openai-compatible.test/v1",
                model: "test-model"
            },
            FakeOpenAI as any
        );

        factory.createChatClient({ maxRetries: 2, timeoutMs: 30000 });

        expect(calls[0]).toEqual({
            apiKey: "key",
            baseURL: "https://openai-compatible.test/v1",
            maxRetries: 2,
            timeout: 30000
        });
        expect(factory.chatModel()).toBe("test-model");
    });

    it("omits blank baseURL so the SDK can use its default", () => {
        const calls: Record<string, unknown>[] = [];
        class FakeOpenAI {
            constructor(options: Record<string, unknown>) {
                calls.push(options);
            }
        }

        const factory = new OpenAIClientFactory(
            {
                apiKey: "key",
                baseUrl: "",
                model: "gpt-4o"
            },
            FakeOpenAI as any
        );

        factory.createChatClient();

        expect(calls[0]).toMatchObject({
            apiKey: "key",
            maxRetries: 3,
            timeout: 60000
        });
        expect(calls[0]).toHaveProperty("baseURL", undefined);
    });
});
