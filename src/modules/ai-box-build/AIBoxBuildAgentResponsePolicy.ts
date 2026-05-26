import {
    AIBoxBuildArtifacts,
    AIBoxBuildPhase
} from "../../interfaces/AIBoxBuildJob";
import {
    firstNonEmpty,
    mergeStringArrays,
    normalizeStringArray
} from "./AIBoxBuildArtifactPolicy";

export type AgentParsedResponse = {
    phase?: string;
    summary?: string;
    current_understanding?: unknown;
    open_questions?: unknown;
    risks?: unknown;
    next_actions?: unknown;
    artifacts?: Partial<AIBoxBuildArtifacts>;
    raw_content?: string;
    parsed_as_json?: boolean;
    model_used?: string;
};

export function normalizeAIBoxChatCompletion(completion: unknown): any {
    if (typeof completion !== "string") return completion;

    try {
        return JSON.parse(completion);
    } catch {
        return {
            choices: [
                {
                    message: {
                        content: completion
                    }
                }
            ]
        };
    }
}

export function parseAIBoxAgentResponse(content: string): AgentParsedResponse {
    const candidates: string[] = [];
    const addCandidate = (value: string | undefined) => {
        const trimmed = value?.trim();
        if (trimmed && !candidates.includes(trimmed)) candidates.push(trimmed);
    };

    addCandidate(content);
    addCandidate(content.replace(/^#\s*(?:design|setup|writeup)\.md\s*/i, ""));

    const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
    addCandidate(fenceMatch?.[1]);

    for (const source of [...candidates]) {
        const firstBrace = source.indexOf("{");
        const lastBrace = source.lastIndexOf("}");
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            addCandidate(source.slice(firstBrace, lastBrace + 1));
        }
    }

    for (const candidate of candidates) {
        for (let trimRight = 0; trimRight <= 3; trimRight++) {
            const attempt = trimRight === 0 ? candidate : candidate.slice(0, -trimRight).trim();
            try {
                const parsed = JSON.parse(attempt) as AgentParsedResponse;
                if (parsed && typeof parsed === "object") return coerceAIBoxParsedResponse(parsed);
            } catch {
                // try next repair
            }
        }
    }

    return {
        phase: AIBoxBuildPhase.design,
        summary: "AI returned non-JSON output; stored it as a draft for review.",
        current_understanding: [],
        open_questions: ["AI output format needs review before proceeding."],
        risks: ["The agent response could not be parsed as structured JSON."],
        next_actions: ["Ask the agent to reformat the result or regenerate the job."],
        artifacts: {
            design_md: `# design.md\n\n${content}`,
            setup_md: "# setup.md\n\nPending structured generation.",
            writeup_md: "# writeup.md\n\nPending structured generation."
        },
        raw_content: content,
        parsed_as_json: false
    };
}

export function coerceAIBoxParsedResponse(parsed: AgentParsedResponse & Record<string, unknown>): AgentParsedResponse {
    const artifacts = parsed.artifacts && typeof parsed.artifacts === "object"
        ? { ...parsed.artifacts }
        : {};

    for (const key of ["design_md", "setup_md", "writeup_md"] as const) {
        if (typeof artifacts[key] !== "string" && typeof parsed[key] === "string") {
            artifacts[key] = parsed[key] as string;
        }
    }

    return {
        ...parsed,
        artifacts,
        parsed_as_json: true
    };
}

export function buildAIBoxAgentFailureDraft(
    direction: string,
    errorMessage: string,
    existingArtifacts?: Partial<AIBoxBuildArtifacts>
): AgentParsedResponse {
    return {
        phase: AIBoxBuildPhase.design,
        summary: "AI build generation failed; existing draft preserved for review.",
        current_understanding: [`Requested direction: ${direction}`],
        open_questions: ["Retry generation or reduce scope before approving this machine build."],
        risks: [`AI service failure: ${errorMessage}`],
        next_actions: ["Retry after the AI service recovers, or provide narrower feedback for split artifact generation."],
        artifacts: {
            design_md: existingArtifacts?.design_md || `# design.md\n\n## Direction\n\n${direction}\n\n## Generation failure\n\n${errorMessage}`,
            setup_md: existingArtifacts?.setup_md || "# setup.md\n\nPending setup details due to AI service failure.",
            writeup_md: existingArtifacts?.writeup_md || "# writeup.md\n\nPending solve path due to AI service failure."
        }
    };
}

export function publicAIBoxAgentError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer [redacted]').slice(0, 500);
}

export function buildAIBoxAgentHistoryContent(parsed: AgentParsedResponse): string {
    return JSON.stringify({
        phase: parsed.phase,
        summary: parsed.summary,
        current_understanding: parsed.current_understanding,
        open_questions: parsed.open_questions,
        risks: parsed.risks,
        next_actions: parsed.next_actions,
        artifacts: parsed.artifacts
    }, null, 2);
}

export function buildAIBoxArtifactRepairAggregate(
    partials: AgentParsedResponse[],
    artifacts: Partial<AIBoxBuildArtifacts>,
    defaultSummary: string
): AgentParsedResponse {
    return {
        phase: AIBoxBuildPhase.verification,
        summary: firstNonEmpty(partials.map((item) => item.summary)) || defaultSummary,
        current_understanding: mergeStringArrays(partials.flatMap((item) => normalizeStringArray(item.current_understanding))),
        open_questions: mergeStringArrays(partials.flatMap((item) => normalizeStringArray(item.open_questions))),
        risks: mergeStringArrays(partials.flatMap((item) => normalizeStringArray(item.risks))),
        next_actions: mergeStringArrays(partials.flatMap((item) => normalizeStringArray(item.next_actions))),
        artifacts
    };
}
