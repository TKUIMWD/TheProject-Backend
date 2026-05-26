import { describe, expect, it } from "vitest";
import { AIBoxBuildPhase } from "../src/interfaces/AIBoxBuildJob";
import {
    buildAIBoxAgentFailureDraft,
    buildAIBoxAgentHistoryContent,
    buildAIBoxArtifactRepairAggregate,
    coerceAIBoxParsedResponse,
    normalizeAIBoxChatCompletion,
    parseAIBoxAgentResponse,
    publicAIBoxAgentError
} from "../src/modules/ai-box-build/AIBoxBuildAgentResponsePolicy";

describe("AIBoxBuildAgentResponsePolicy", () => {
    it("normalizes string chat completions", () => {
        expect(normalizeAIBoxChatCompletion(JSON.stringify({ choices: [] }))).toEqual({ choices: [] });
        expect(normalizeAIBoxChatCompletion("plain text")).toEqual({
            choices: [
                {
                    message: {
                        content: "plain text"
                    }
                }
            ]
        });
    });

    it("parses JSON agent responses from fenced content", () => {
        const parsed = parseAIBoxAgentResponse(`Here:\n\`\`\`json\n${JSON.stringify({
            phase: AIBoxBuildPhase.implementation,
            summary: "ready",
            design_md: "design",
            setup_md: "setup",
            writeup_md: "writeup"
        })}\n\`\`\``);

        expect(parsed).toEqual({
            phase: AIBoxBuildPhase.implementation,
            summary: "ready",
            design_md: "design",
            setup_md: "setup",
            writeup_md: "writeup",
            artifacts: {
                design_md: "design",
                setup_md: "setup",
                writeup_md: "writeup"
            },
            parsed_as_json: true
        });
    });

    it("repairs JSON embedded in surrounding text", () => {
        expect(parseAIBoxAgentResponse(`prefix {"summary":"ok","artifacts":{"design_md":"d"}} suffix`)).toMatchObject({
            summary: "ok",
            artifacts: {
                design_md: "d"
            },
            parsed_as_json: true
        });
    });

    it("falls back to draft artifacts for non-JSON content", () => {
        expect(parseAIBoxAgentResponse("freeform draft")).toEqual({
            phase: AIBoxBuildPhase.design,
            summary: "AI returned non-JSON output; stored it as a draft for review.",
            current_understanding: [],
            open_questions: ["AI output format needs review before proceeding."],
            risks: ["The agent response could not be parsed as structured JSON."],
            next_actions: ["Ask the agent to reformat the result or regenerate the job."],
            artifacts: {
                design_md: "# design.md\n\nfreeform draft",
                setup_md: "# setup.md\n\nPending structured generation.",
                writeup_md: "# writeup.md\n\nPending structured generation."
            },
            raw_content: "freeform draft",
            parsed_as_json: false
        });
    });

    it("coerces top-level artifact fields into artifacts", () => {
        expect(coerceAIBoxParsedResponse({
            summary: "ok",
            artifacts: {},
            design_md: "design"
        })).toEqual({
            summary: "ok",
            artifacts: {
                design_md: "design"
            },
            design_md: "design",
            parsed_as_json: true
        });
    });

    it("builds failure drafts and preserves existing artifacts", () => {
        const draft = buildAIBoxAgentFailureDraft("Build a web challenge", "model unavailable", {
            setup_md: "# setup.md\n\nExisting setup."
        });

        expect(draft).toMatchObject({
            phase: AIBoxBuildPhase.design,
            summary: "AI build generation failed; existing draft preserved for review.",
            current_understanding: ["Requested direction: Build a web challenge"],
            risks: ["AI service failure: model unavailable"],
            artifacts: {
                setup_md: "# setup.md\n\nExisting setup.",
                writeup_md: "# writeup.md\n\nPending solve path due to AI service failure."
            }
        });
        expect(draft.artifacts?.design_md).toContain("## Generation failure");
        expect(draft.artifacts?.design_md).toContain("model unavailable");
    });

    it("redacts bearer tokens and truncates public agent errors", () => {
        expect(publicAIBoxAgentError(new Error("failed Bearer abc.DEF_123+/=- token"))).toBe("failed Bearer [redacted] token");
        expect(publicAIBoxAgentError(`x${"a".repeat(600)}`)).toHaveLength(500);
    });

    it("serializes only review-safe parsed response history fields", () => {
        const content = buildAIBoxAgentHistoryContent({
            phase: AIBoxBuildPhase.verification,
            summary: "done",
            current_understanding: ["understanding"],
            open_questions: ["question"],
            risks: ["risk"],
            next_actions: ["action"],
            artifacts: { design_md: "design" },
            raw_content: "raw",
            parsed_as_json: false,
            model_used: "model-a"
        });

        expect(JSON.parse(content)).toEqual({
            phase: AIBoxBuildPhase.verification,
            summary: "done",
            current_understanding: ["understanding"],
            open_questions: ["question"],
            risks: ["risk"],
            next_actions: ["action"],
            artifacts: { design_md: "design" }
        });
        expect(content).not.toContain("raw_content");
        expect(content).not.toContain("model_used");
    });

    it("aggregates split artifact repair responses into a verification response", () => {
        expect(buildAIBoxArtifactRepairAggregate([
            {
                summary: "",
                current_understanding: ["Initial", "Initial"],
                open_questions: ["Need port"],
                risks: ["Risk A"],
                next_actions: ["Action A"]
            },
            {
                summary: "Artifacts repaired",
                current_understanding: ["Final"],
                open_questions: ["Need port"],
                risks: ["Risk B"],
                next_actions: ["Action A", "Action B"]
            }
        ], {
            design_md: "# design.md",
            setup_md: "# setup.md",
            writeup_md: "# writeup.md"
        }, "fallback summary")).toEqual({
            phase: AIBoxBuildPhase.verification,
            summary: "Artifacts repaired",
            current_understanding: ["Initial", "Final"],
            open_questions: ["Need port"],
            risks: ["Risk A", "Risk B"],
            next_actions: ["Action A", "Action B"],
            artifacts: {
                design_md: "# design.md",
                setup_md: "# setup.md",
                writeup_md: "# writeup.md"
            }
        });
    });

    it("uses the default split repair summary when partials do not include one", () => {
        expect(buildAIBoxArtifactRepairAggregate([
            { summary: " " },
            { summary: undefined }
        ], {}, "fallback summary").summary).toBe("fallback summary");
    });
});
