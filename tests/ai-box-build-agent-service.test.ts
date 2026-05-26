import { describe, expect, it } from "vitest";
import { AIBoxBuildPhase, AIBoxBuildJobStatus } from "../src/interfaces/AIBoxBuildJob";
import { AIBoxBuildAgentService } from "../src/modules/ai-box-build/AIBoxBuildAgentService";

function jsonCompletion(body: unknown) {
    return JSON.stringify({
        choices: [
            {
                message: {
                    content: JSON.stringify(body)
                }
            }
        ]
    });
}

function fullArtifacts(suffix = "") {
    const designBody = `Design ${suffix} `.repeat(90);
    const setupBody = `Setup ${suffix} `.repeat(100);
    const writeupBody = `Writeup ${suffix} `.repeat(80);
    return {
        design_md: `# design.md\n\n${designBody}`,
        setup_md: `# setup.md\n\n${setupBody}`,
        writeup_md: `# writeup.md\n\n${writeupBody}`
    };
}

function parsedResponse(artifacts: Record<string, string>, summary = "done") {
    return {
        phase: AIBoxBuildPhase.design,
        summary,
        current_understanding: ["understood"],
        open_questions: [],
        risks: [],
        next_actions: [],
        artifacts
    };
}

function makeService(responses: string[], models = ["model-a"]) {
    const calls: Array<{ messages: any[]; model: string }> = [];
    const pending = [...responses];
    const chatClient = {
        modelCandidates: () => models,
        createJsonChatCompletion: async (messages: any[], model: string) => {
            calls.push({ messages, model });
            const response = pending.shift();
            if (response === undefined) throw new Error("no fake response queued");
            if (response.startsWith("throw:")) throw new Error(response.slice("throw:".length));
            return response;
        }
    };

    return {
        calls,
        service: new AIBoxBuildAgentService({ chatClient })
    };
}

function makeJob(overrides: Record<string, unknown> = {}) {
    return {
        _id: "job-1",
        requester_user_id: "user-1",
        requester_role: "admin",
        direction: "Build a Linux exploitation lab",
        constraints: "",
        allow_ai_assistant: true,
        status: AIBoxBuildJobStatus.awaiting_review,
        phase: AIBoxBuildPhase.design,
        artifacts: fullArtifacts("old"),
        messages: [],
        created_at: new Date("2026-05-26T00:00:00.000Z"),
        updated_at: new Date("2026-05-26T00:00:00.000Z"),
        ...overrides
    } as any;
}

describe("AIBoxBuildAgentService", () => {
    it("runs initial generation with the first successful model candidate", async () => {
        const { service, calls } = makeService([
            "throw:temporary model outage",
            jsonCompletion(parsedResponse(fullArtifacts("new"), "combined"))
        ], ["model-a", "model-b"]);

        const result = await service.runInitialAgent("Build a lab", "Use Ubuntu", true);

        expect(result).toMatchObject({
            summary: "combined",
            model_used: "model-b",
            artifacts: fullArtifacts("new")
        });
        expect(calls.map(call => call.model)).toEqual(["model-a", "model-b"]);
    });

    it("falls back to split artifact generation when combined output is incomplete", async () => {
        const { service, calls } = makeService([
            jsonCompletion(parsedResponse({ design_md: "# design.md\n\nOnly design" }, "incomplete")),
            jsonCompletion(parsedResponse({ design_md: fullArtifacts("split").design_md }, "design")),
            jsonCompletion(parsedResponse({ setup_md: fullArtifacts("split").setup_md }, "setup")),
            jsonCompletion(parsedResponse({ writeup_md: fullArtifacts("split").writeup_md }, "writeup"))
        ]);

        const result = await service.runInitialAgent("Build a lab", "", true);

        expect(result).toMatchObject({
            phase: AIBoxBuildPhase.verification,
            summary: "design",
            artifacts: {
                design_md: fullArtifacts("split").design_md,
                setup_md: fullArtifacts("split").setup_md,
                writeup_md: fullArtifacts("split").writeup_md
            }
        });
        expect(calls).toHaveLength(4);
        expect(calls.slice(1).map(call => call.messages[1].content)).toEqual([
            expect.stringContaining("design.md"),
            expect.stringContaining("setup.md"),
            expect.stringContaining("writeup.md")
        ]);
    });

    it("runs targeted repair for artifact-specific feedback", async () => {
        const { service, calls } = makeService([
            jsonCompletion(parsedResponse({ setup_md: fullArtifacts("updated").setup_md }, "setup fixed"))
        ]);
        const job = makeJob();

        const result = await service.runJobUpdate(job, "Please only update setup.md commands.");

        expect(result).toMatchObject({
            summary: "setup fixed",
            artifacts: {
                design_md: fullArtifacts("old").design_md,
                setup_md: fullArtifacts("updated").setup_md,
                writeup_md: fullArtifacts("old").writeup_md
            }
        });
        expect(calls).toHaveLength(1);
        expect(calls[0].messages[1].content).toContain("setup.md");
    });
});
