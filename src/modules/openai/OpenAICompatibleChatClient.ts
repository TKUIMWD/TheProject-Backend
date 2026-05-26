import { env } from "../../config/env";

export type OpenAICompatibleChatMessage = {
    role: 'system' | 'user' | 'assistant';
    content: string;
};

type OpenAICompatibleConfig = {
    apiKey: string;
    baseUrl: string;
    model: string;
    boxBuildModel: string;
    boxBuildModels: readonly string[];
    boxBuildMaxTokens: number;
    boxBuildTimeoutMs: number;
};

type FetchRequester = typeof fetch;

export class OpenAICompatibleChatClient {
    constructor(
        private readonly config: OpenAICompatibleConfig = env.openai,
        private readonly requester: FetchRequester = fetch
    ) {}

    public modelCandidates(): string[] {
        return Array.from(new Set([
            ...this.config.boxBuildModels,
            this.config.boxBuildModel,
            this.config.model,
            'gpt-4o'
        ].map(model => model.trim()).filter(Boolean)));
    }

    public async createJsonChatCompletion(
        messages: OpenAICompatibleChatMessage[],
        model: string
    ): Promise<string> {
        if (!this.config.apiKey) {
            throw new Error("OPENAI_API_KEY is not configured");
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.boxBuildTimeoutMs);
        const baseUrl = (this.config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');

        try {
            const response = await this.requester(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model,
                    messages,
                    max_completion_tokens: this.config.boxBuildMaxTokens,
                    response_format: { type: 'json_object' }
                }),
                signal: controller.signal
            });

            const raw = await response.text();
            if (!response.ok) {
                throw new Error(`AI service returned ${response.status}: ${raw.slice(0, 500)}`);
            }
            return raw;
        } finally {
            clearTimeout(timeout);
        }
    }
}

export const openAICompatibleChatClient = new OpenAICompatibleChatClient();
