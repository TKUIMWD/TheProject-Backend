import { describe, expect, it } from "vitest";
import { AIChatPlatformGuideService } from "../src/modules/ai-chat/AIChatPlatformGuideService";

const user = {
    _id: { toString: () => "user-1" },
    username: "alice"
} as any;

function makeService(options: {
    completionContent?: string;
    streamChunks?: string[];
    guide?: string;
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const chatFactory = {
        chatModel: () => "test-model",
        createChatClient: () => ({
            chat: {
                completions: {
                    create: async (request: Record<string, unknown>) => {
                        calls.push({ method: "createCompletion", args: [request] });
                        if (request.stream) {
                            async function* stream() {
                                for (const content of options.streamChunks ?? ["hello", " world"]) {
                                    yield { choices: [{ delta: { content } }] };
                                }
                            }
                            return stream();
                        }

                        return {
                            choices: [
                                {
                                    message: {
                                        content: options.completionContent ?? "Guidance text"
                                    }
                                }
                            ]
                        };
                    }
                }
            }
        })
    };

    return {
        calls,
        service: new AIChatPlatformGuideService({
            chatFactory,
            guideLoader: async () => options.guide ?? "Platform guide"
        })
    };
}

describe("AIChatPlatformGuideService", () => {
    it("generates non-stream platform guidance", async () => {
        const { service, calls } = makeService();

        await expect(service.getGuide({
            user,
            userRole: "admin",
            body: { user_input: "How do I create a VM?" }
        })).resolves.toMatchObject({
            code: 200,
            message: "Guidance generated successfully",
            body: {
                response: "Guidance text"
            }
        });

        expect(calls[0].args[0]).toMatchObject({
            model: "test-model",
            max_completion_tokens: 1500
        });
    });

    it("streams platform guidance chunks", async () => {
        const { service } = makeService({
            streamChunks: ["first", "second"]
        });

        const chunks: string[] = [];
        for await (const chunk of service.streamGuide({
            user,
            userRole: "user",
            body: { user_input: "list course features" }
        })) {
            chunks.push(chunk);
        }

        expect(chunks).toEqual(["first", "second"]);
    });

    it("returns the existing missing-user-input message", async () => {
        const { service, calls } = makeService();

        await expect(service.getGuide({
            user,
            userRole: "user",
            body: {}
        })).resolves.toMatchObject({
            code: 400,
            message: "Missing required field: user_input is required"
        });
        expect(calls).toEqual([]);
    });
});
