import {
    AIBoxBuildArtifacts,
    AIBoxBuildJob
} from "../../interfaces/AIBoxBuildJob";
import { logger } from "../../middlewares/log";
import { AIBoxBuildPrompts } from "../../utils/AI_Prompts/AIBoxBuildPrompts";
import {
    AIBoxArtifactName,
    coerceRawAIBoxArtifact,
    hasUsableAIBoxArtifacts,
    isUsableAIBoxArtifact,
    normalizeAIBoxBuildArtifacts
} from "./AIBoxBuildArtifactPolicy";
import {
    AgentParsedResponse,
    buildAIBoxArtifactRepairAggregate,
    normalizeAIBoxChatCompletion,
    parseAIBoxAgentResponse
} from "./AIBoxBuildAgentResponsePolicy";
import {
    shouldUseTargetedArtifactRepair,
    targetArtifactsForRepair
} from "./AIBoxBuildRepairPolicy";
import {
    OpenAICompatibleChatMessage,
    openAICompatibleChatClient
} from "../openai/OpenAICompatibleChatClient";

type AIBoxBuildChatClientPort = {
    modelCandidates(): string[];
    createJsonChatCompletion(messages: OpenAICompatibleChatMessage[], model: string): Promise<string>;
};

export type AIBoxBuildAgentServiceDeps = {
    chatClient?: AIBoxBuildChatClientPort;
};

export class AIBoxBuildAgentService {
    private readonly chatClient: AIBoxBuildChatClientPort;

    constructor(deps: AIBoxBuildAgentServiceDeps = {}) {
        this.chatClient = deps.chatClient ?? openAICompatibleChatClient;
    }

    public async runInitialAgent(direction: string, constraints: string, allowAiAssistant: boolean): Promise<AgentParsedResponse> {
        try {
            const parsed = await this.runAgent([
                { role: 'system', content: AIBoxBuildPrompts.SYSTEM_INIT },
                { role: 'user', content: AIBoxBuildPrompts.buildInitialPrompt(direction, constraints, allowAiAssistant) }
            ]);
            if (!hasUsableAIBoxArtifacts(parsed.artifacts, ['design_md', 'setup_md', 'writeup_md'])) {
                throw new Error("AI response did not include all required artifacts");
            }
            return parsed;
        } catch (error) {
            logger.warn("Combined AI box build generation failed; retrying as split artifacts:", error);
            return this.runSplitArtifactAgent(direction, constraints, allowAiAssistant, {}, "Initial generation.");
        }
    }

    public async runJobUpdate(job: AIBoxBuildJob, message: string): Promise<AgentParsedResponse> {
        if (this.shouldUseTargetedArtifactRepair(job, message)) {
            return this.runTargetedArtifactRepairAgent(job, message);
        }

        return this.runIterationAgent(job, message);
    }

    public shouldUseTargetedArtifactRepair(job: AIBoxBuildJob, message: string): boolean {
        const artifacts = normalizeAIBoxBuildArtifacts(job.artifacts, job.direction);
        return shouldUseTargetedArtifactRepair(message, artifacts);
    }

    public async runIterationAgent(job: AIBoxBuildJob, message: string): Promise<AgentParsedResponse> {
        try {
            const parsed = await this.runAgent([
                { role: 'system', content: AIBoxBuildPrompts.SYSTEM_INIT },
                { role: 'user', content: AIBoxBuildPrompts.buildIterationPrompt(job, message) }
            ]);
            if (!hasUsableAIBoxArtifacts(parsed.artifacts, ['design_md', 'setup_md', 'writeup_md'])) {
                throw new Error("AI response did not include all required artifacts");
            }
            return parsed;
        } catch (error) {
            logger.warn(`Combined AI box build update failed for job ${job._id}; retrying as split artifacts:`, error);
            return this.runSplitArtifactAgent(job.direction, job.constraints || "", job.allow_ai_assistant, job.artifacts, message);
        }
    }

    public async runTargetedArtifactRepairAgent(job: AIBoxBuildJob, userMessage: string): Promise<AgentParsedResponse> {
        const artifacts = normalizeAIBoxBuildArtifacts(job.artifacts, job.direction);
        const artifactOrder = targetArtifactsForRepair(userMessage, artifacts);
        return this.runArtifactRepairAgent(
            job.direction,
            job.constraints || "",
            job.allow_ai_assistant,
            artifacts,
            userMessage,
            artifactOrder,
            `Updated ${artifactOrder.join(', ')}.`
        );
    }

    private async runSplitArtifactAgent(
        direction: string,
        constraints: string,
        allowAiAssistant: boolean,
        existingArtifacts: Partial<AIBoxBuildArtifacts>,
        userMessage: string
    ): Promise<AgentParsedResponse> {
        const artifactOrder: AIBoxArtifactName[] = ['design_md', 'setup_md', 'writeup_md'];
        return this.runArtifactRepairAgent(direction, constraints, allowAiAssistant, existingArtifacts, userMessage, artifactOrder, "AI build artifacts generated in split mode.");
    }

    private async runArtifactRepairAgent(
        direction: string,
        constraints: string,
        allowAiAssistant: boolean,
        existingArtifacts: Partial<AIBoxBuildArtifacts>,
        userMessage: string,
        artifactOrder: AIBoxArtifactName[],
        defaultSummary: string
    ): Promise<AgentParsedResponse> {
        const artifacts: Partial<AIBoxBuildArtifacts> = { ...existingArtifacts };
        const partials: AgentParsedResponse[] = [];

        for (const artifactName of artifactOrder) {
            const parsed = await this.runAgent([
                { role: 'system', content: AIBoxBuildPrompts.SYSTEM_INIT },
                { role: 'user', content: AIBoxBuildPrompts.buildSingleArtifactPrompt(artifactName, direction, constraints, allowAiAssistant, artifacts, userMessage) }
            ]);
            partials.push(parsed);
            let artifact = parsed.artifacts?.[artifactName];
            if (!isUsableAIBoxArtifact(artifactName, artifact) && parsed.raw_content && parsed.raw_content.trim().length > 120) {
                artifact = coerceRawAIBoxArtifact(artifactName, parsed.raw_content);
            }
            if (isUsableAIBoxArtifact(artifactName, artifact)) {
                artifacts[artifactName] = artifact;
            } else {
                throw new Error(`AI response did not include usable ${artifactName}`);
            }
        }

        return buildAIBoxArtifactRepairAggregate(partials, artifacts, defaultSummary);
    }

    private async runAgent(messages: OpenAICompatibleChatMessage[]): Promise<AgentParsedResponse> {
        const errors: string[] = [];
        for (const model of this.chatClient.modelCandidates()) {
            try {
                return await this.runAgentWithModel(messages, model);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                errors.push(`${model}: ${message}`);
                logger.warn(`AI box build model ${model} failed: ${message}`);
            }
        }

        throw new Error(`All AI box build models failed: ${errors.join("; ")}`);
    }

    private async runAgentWithModel(messages: OpenAICompatibleChatMessage[], model: string): Promise<AgentParsedResponse> {
        const raw = await this.chatClient.createJsonChatCompletion(messages, model);
        const normalizedCompletion = normalizeAIBoxChatCompletion(raw);
        const message = normalizedCompletion.choices?.[0]?.message || {};
        const content = message.content || message.reasoning_content || '';
        const parsed = parseAIBoxAgentResponse(content);
        parsed.model_used = model;
        return parsed;
    }
}

export const aiBoxBuildAgentService = new AIBoxBuildAgentService();
