import * as fs from "fs";
import * as path from "path";
import Roles from "../../enum/role";
import { User } from "../../interfaces/User";
import { logger } from "../../middlewares/log";
import { PlatformGuidePrompts } from "../../utils/AI_Prompts/PlatformGuidePrompts";
import { createResponse, resp } from "../../utils/resp";
import { openAIClientFactory, OpenAIClientFactory } from "../openai/OpenAIClientFactory";
import { buildLanguageInstruction } from "./AIChatLanguagePolicy";
import {
    sanitizeAIChatUserInput,
    validateAIChatUserInput
} from "./AIChatRequestPolicy";

type ChatClient = {
    chat: {
        completions: {
            create(request: Record<string, unknown>): Promise<any>;
        };
    };
};

type ChatClientFactory = Pick<OpenAIClientFactory, "chatModel"> & {
    createChatClient(): ChatClient;
};

type AIChatPlatformGuideServiceDeps = {
    chatFactory?: ChatClientFactory;
    guideLoader?: () => Promise<string>;
};

export class AIChatPlatformGuideService {
    private readonly chatFactory: ChatClientFactory;
    private readonly guideLoader: () => Promise<string>;
    private platformGuideContent: string | null = null;

    constructor(deps: AIChatPlatformGuideServiceDeps = {}) {
        this.chatFactory = deps.chatFactory ?? (openAIClientFactory as unknown as ChatClientFactory);
        this.guideLoader = deps.guideLoader ?? this.loadPlatformGuideFromDisk.bind(this);
    }

    public async *streamGuide(input: {
        user: User;
        userRole: Roles;
        body: { user_input?: unknown };
    }): AsyncGenerator<string, void, unknown> {
        try {
            const contextResult = await this.buildGuideContext(input);
            if (!contextResult.ok) {
                yield this.toStreamError(contextResult.error);
                return;
            }

            logger.info(`User ${input.user.username} (${input.user._id}) requesting platform guidance (stream)`);

            const stream = await this.chatFactory.createChatClient().chat.completions.create({
                ...this.buildCompletionRequest(contextResult.context),
                stream: true
            });

            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content;
                if (content) {
                    yield content;
                }
            }

            logger.info(`Platform guidance generated successfully (stream) for User ${input.user.username}`);
        } catch (error) {
            logger.error("Error in AIChatPlatformGuideService.streamGuide:", error);
            yield JSON.stringify({
                error: "Internal server error while generating guidance",
                code: 500
            });
        }
    }

    public async getGuide(input: {
        user: User;
        userRole: Roles;
        body: { user_input?: unknown };
    }): Promise<resp<{ response: string } | undefined>> {
        try {
            const contextResult = await this.buildGuideContext(input);
            if (!contextResult.ok) {
                return createResponse(contextResult.error.code, contextResult.error.message);
            }

            logger.info(`User ${input.user.username} (${input.user._id}) requesting platform guidance (non-stream)`);

            const completion = await this.chatFactory.createChatClient().chat.completions.create(
                this.buildCompletionRequest(contextResult.context)
            );

            const response = completion.choices[0]?.message?.content || "Unable to generate guidance at this time.";
            logger.info(`Platform guidance generated successfully (non-stream) for User ${input.user.username}`);

            return createResponse(200, "Guidance generated successfully", { response });
        } catch (error) {
            logger.error("Error in AIChatPlatformGuideService.getGuide:", error);
            return createResponse(500, "Internal server error while generating guidance");
        }
    }

    private async buildGuideContext(input: {
        user: User;
        userRole: Roles;
        body: { user_input?: unknown };
    }): Promise<{
        ok: true;
        context: {
            platformGuideContent: string;
            userRole: Roles;
            sanitizedInput: string;
        };
    } | { ok: false; error: resp<undefined> }> {
        const inputResult = validateAIChatUserInput(input.body.user_input);
        if (!inputResult.valid) {
            return {
                ok: false,
                error: createResponse(400, inputResult.message === "user_input must be a non-empty string"
                    ? "Missing required field: user_input is required"
                    : inputResult.message)
            };
        }

        return {
            ok: true,
            context: {
                platformGuideContent: await this.guideLoader(),
                userRole: input.userRole,
                sanitizedInput: sanitizeAIChatUserInput(inputResult.input)
            }
        };
    }

    private buildCompletionRequest(context: {
        platformGuideContent: string;
        userRole: Roles;
        sanitizedInput: string;
    }): Record<string, unknown> {
        const systemPrompt = `${PlatformGuidePrompts.SYSTEM_INIT}\n\n${buildLanguageInstruction(context.sanitizedInput)}`;
        const userPrompt = PlatformGuidePrompts.buildPlatformGuidePrompt(
            context.platformGuideContent,
            context.userRole,
            context.sanitizedInput
        );

        return {
            model: this.chatFactory.chatModel(),
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            max_completion_tokens: 1500
        };
    }

    private async loadPlatformGuideFromDisk(): Promise<string> {
        if (this.platformGuideContent) {
            return this.platformGuideContent;
        }

        try {
            const guidePath = path.join(__dirname, "../../../docs/PLATFORM_GUIDE.md");
            this.platformGuideContent = fs.readFileSync(guidePath, "utf-8");
            return this.platformGuideContent;
        } catch (error) {
            logger.error("Error loading platform guide:", error);
            return "Platform guide not available. Please contact support.";
        }
    }

    private toStreamError(error: resp<undefined>): string {
        return JSON.stringify({
            error: error.message,
            code: error.code
        });
    }
}

export const aiChatPlatformGuideService = new AIChatPlatformGuideService();
