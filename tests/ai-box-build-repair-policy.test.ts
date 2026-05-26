import { describe, expect, it } from "vitest";
import { AIBoxBuildArtifacts } from "../src/interfaces/AIBoxBuildJob";
import {
    shouldUseTargetedArtifactRepair,
    targetArtifactsForRepair
} from "../src/modules/ai-box-build/AIBoxBuildRepairPolicy";

const completeArtifacts: AIBoxBuildArtifacts = {
    design_md: "# design.md\n\n" + "design detail ".repeat(40),
    setup_md: "# setup.md\n\n" + "setup detail ".repeat(40),
    writeup_md: "# writeup.md\n\n" + "writeup detail ".repeat(40)
};

describe("AIBoxBuildRepairPolicy", () => {
    it("uses targeted repair when the message names an artifact", () => {
        expect(shouldUseTargetedArtifactRepair("Please revise setup.md", completeArtifacts)).toBe(true);
        expect(targetArtifactsForRepair("Please revise setup.md", completeArtifacts)).toEqual(['setup_md']);
    });

    it("uses targeted repair when any artifact is unusable", () => {
        const artifacts = { ...completeArtifacts, design_md: "too short" };

        expect(shouldUseTargetedArtifactRepair("Make it better", artifacts)).toBe(true);
        expect(targetArtifactsForRepair("Make it better", artifacts)).toEqual(['design_md']);
    });

    it("does not use targeted repair for generic feedback when artifacts are complete", () => {
        expect(shouldUseTargetedArtifactRepair("Increase difficulty a little", completeArtifacts)).toBe(false);
    });

    it("targets multiple named or missing artifacts in deterministic order", () => {
        const artifacts = { ...completeArtifacts, writeup_md: "" };

        expect(targetArtifactsForRepair("Update design.md and setup.md", artifacts)).toEqual([
            'design_md',
            'setup_md',
            'writeup_md'
        ]);
    });

    it("falls back to all artifacts when repair is requested without a specific target", () => {
        expect(targetArtifactsForRepair("Repair the generated artifacts", completeArtifacts)).toEqual([
            'design_md',
            'setup_md',
            'writeup_md'
        ]);
    });
});
