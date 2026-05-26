import OpenAI from "openai";
import { env } from "../../config/env";

type OpenAIClientOptions = {
    maxRetries?: number;
    timeoutMs?: number;
};

type OpenAIConfig = {
    apiKey: string;
    baseUrl: string;
    model: string;
};

type OpenAIConstructor = new (options: Record<string, unknown>) => OpenAI;

export class OpenAIClientFactory {
    constructor(
        private readonly config: OpenAIConfig = env.openai,
        private readonly OpenAIClass: OpenAIConstructor = OpenAI as unknown as OpenAIConstructor
    ) {}

    public createChatClient(options: OpenAIClientOptions = {}): OpenAI {
        return new this.OpenAIClass({
            apiKey: this.config.apiKey,
            baseURL: this.config.baseUrl || undefined,
            maxRetries: options.maxRetries ?? 3,
            timeout: options.timeoutMs ?? 60 * 1000
        });
    }

    public chatModel(): string {
        return this.config.model;
    }
}

export const openAIClientFactory = new OpenAIClientFactory();
