import { describe, expect, it } from "vitest";
import { AIBoxBuildPhase, AIBoxBuildValidationReport } from "../src/interfaces/AIBoxBuildJob";
import {
    coerceRawAIBoxArtifact,
    containsUnresolvedPlaceholder,
    defaultAIBoxBuildValidationReport,
    firstNonEmpty,
    hasUsableAIBoxArtifacts,
    isUsableAIBoxArtifact,
    mergeStringArrays,
    mergeValidationIntoList,
    normalizeAIBoxBuildArtifacts,
    normalizeAIBoxBuildPhase,
    normalizeString,
    normalizeStringArray
} from "../src/modules/ai-box-build/AIBoxBuildArtifactPolicy";

describe("AIBoxBuildArtifactPolicy", () => {
    it("normalizes phases, strings, and string arrays", () => {
        expect(normalizeAIBoxBuildPhase(AIBoxBuildPhase.verification)).toBe(AIBoxBuildPhase.verification);
        expect(normalizeAIBoxBuildPhase("unknown")).toBe(AIBoxBuildPhase.design);
        expect(normalizeString("summary")).toBe("summary");
        expect(normalizeString(123)).toBe("");
        expect(normalizeStringArray([" one ", "", 2, "two"])).toEqual(["one", "two"]);
    });

    it("normalizes artifacts with fallback content", () => {
        expect(normalizeAIBoxBuildArtifacts({
            design_md: "custom design",
            setup_md: "   "
        }, "Build a web lab")).toEqual({
            design_md: "custom design",
            setup_md: "# setup.md\n\nPending setup details.",
            writeup_md: "# writeup.md\n\nPending solve path."
        });
    });

    it("detects usable artifacts and unresolved placeholders", () => {
        expect(containsUnresolvedPlaceholder("TODO: finish")).toBe(true);
        expect(containsUnresolvedPlaceholder("ready for review")).toBe(false);
        expect(isUsableAIBoxArtifact("design_md", "x".repeat(500))).toBe(true);
        expect(isUsableAIBoxArtifact("design_md", "TODO ".repeat(200))).toBe(false);
        expect(isUsableAIBoxArtifact("writeup_md", "x".repeat(349))).toBe(false);
    });

    it("detects whether all required artifacts are usable", () => {
        expect(hasUsableAIBoxArtifacts({
            design_md: "d".repeat(500),
            setup_md: "s".repeat(500),
            writeup_md: "w".repeat(350)
        }, ["design_md", "setup_md", "writeup_md"])).toBe(true);
        expect(hasUsableAIBoxArtifacts({
            design_md: "d".repeat(500),
            setup_md: "TODO ".repeat(120),
            writeup_md: "w".repeat(350)
        }, ["design_md", "setup_md", "writeup_md"])).toBe(false);
    });

    it("coerces raw artifact text into Markdown", () => {
        expect(coerceRawAIBoxArtifact("setup_md", "run commands")).toBe("# setup.md\n\nrun commands");
        expect(coerceRawAIBoxArtifact("setup_md", "# Existing\n\nrun commands")).toBe("# Existing\n\nrun commands");
    });

    it("merges and deduplicates string arrays", () => {
        expect(mergeStringArrays([" One ", "one", "", 3, "Two"])).toEqual(["One", "Two"]);
        expect(firstNonEmpty(["", 3, " answer "])).toBe("answer");
    });

    it("merges validation findings into risks/actions", () => {
        const report: AIBoxBuildValidationReport = {
            status: "blocked",
            blockers: ["missing setup"],
            warnings: ["short writeup"],
            passed_checks: [],
            artifact_checks: { design_md: [], setup_md: [], writeup_md: [] },
            requirement_checks: [],
            generated_at: new Date("2026-05-01T00:00:00.000Z")
        };

        expect(mergeValidationIntoList(["existing"], report, "risk")).toEqual([
            "existing",
            "Validation blocker: missing setup",
            "Validation warning: short writeup"
        ]);
        expect(mergeValidationIntoList([], report, "action")).toEqual([
            "Resolve validation blocker: missing setup"
        ]);
    });

    it("builds default validation reports", () => {
        const now = new Date("2026-05-01T00:00:00.000Z");
        expect(defaultAIBoxBuildValidationReport(now)).toEqual({
            status: "blocked",
            blockers: ["Validation has not run for this job."],
            warnings: [],
            passed_checks: [],
            artifact_checks: { design_md: [], setup_md: [], writeup_md: [] },
            requirement_checks: [],
            generated_at: now
        });
    });
});
