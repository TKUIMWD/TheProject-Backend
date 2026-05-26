import { describe, expect, it } from "vitest";
import {
    ensureSetupMarkdownHasGeneratedCommands,
    ensureUbuntuBaselineInMarkdown,
    requiredUbuntuBaseline
} from "../src/modules/ai-box-build/AIBoxBuildMarkdownPolicy";

describe("AIBoxBuildMarkdownPolicy", () => {
    it("uses configured latest Ubuntu Server when latest Ubuntu is requested", () => {
        expect(requiredUbuntuBaseline("Build this on the latest Ubuntu Server release ISO", "26.04")).toBe("26.04");
    });

    it("preserves explicit Ubuntu versions from source text", () => {
        expect(requiredUbuntuBaseline("Use Ubuntu Server 24.04 for package compatibility", "26.04")).toBe("24.04");
        expect(requiredUbuntuBaseline("Target 26.04 Ubuntu with nginx", "24.04")).toBe("26.04");
    });

    it("adds the required Ubuntu baseline when missing from markdown", () => {
        const result = ensureUbuntuBaselineInMarkdown("# design.md\n\nUse nginx.", "Build on latest Ubuntu", "26.04");

        expect(result).toContain("## Platform Baseline");
        expect(result).toContain("Ubuntu Server 26.04");
    });

    it("does not duplicate an existing Ubuntu baseline", () => {
        const content = "# setup.md\n\nTarget OS: Ubuntu Server 26.04.";

        expect(ensureUbuntuBaselineInMarkdown(content, "Build on latest Ubuntu", "26.04")).toBe(content);
    });

    it("mirrors generated setup commands when setup markdown lacks concrete commands", () => {
        const result = ensureSetupMarkdownHasGeneratedCommands(
            "# setup.md\n\nReview generated setup script.",
            "#!/usr/bin/env bash\napt-get update\nsystemctl restart nginx"
        );

        expect(result).toContain("## Generated Setup Command Plan");
        expect(result).toContain("apt-get update");
        expect(result).toContain("systemctl restart nginx");
    });

    it("keeps setup markdown unchanged when commands already exist or script is empty", () => {
        const withCommands = "# setup.md\n\n```bash\napt-get update\n```";
        const withoutScript = "# setup.md\n\nReview generated setup script.";

        expect(ensureSetupMarkdownHasGeneratedCommands(withCommands, "systemctl restart nginx")).toBe(withCommands);
        expect(ensureSetupMarkdownHasGeneratedCommands(withoutScript, "   ")).toBe(withoutScript);
    });
});
