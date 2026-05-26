import * as path from "path";
import { describe, expect, it } from "vitest";
import {
    buildGeneratedScriptPath,
    buildMissingGeneratedScriptMessage,
    buildUnusableGeneratedScriptMessage,
    validateGeneratedScriptContent
} from "../src/modules/ai-box-build/AIBoxBuildGeneratedScriptPolicy";

describe("AIBoxBuildGeneratedScriptPolicy", () => {
    it("builds generated script paths and stable error messages", () => {
        expect(buildGeneratedScriptPath("/tmp/workspace/job-1", "setup.sh")).toBe(path.join("/tmp/workspace/job-1", "generated", "setup.sh"));
        expect(buildMissingGeneratedScriptMessage("setup.sh")).toBe("opencode did not generate generated/setup.sh");
        expect(buildUnusableGeneratedScriptMessage("validation.sh")).toBe("generated/validation.sh is not a usable bash script");
    });

    it("accepts generated bash scripts with shebang and enough content", () => {
        expect(validateGeneratedScriptContent("setup.sh", "#!/usr/bin/env bash\nset -euo pipefail\necho ready\n")).toEqual({ valid: true });
    });

    it("rejects scripts without shebang or useful content", () => {
        expect(validateGeneratedScriptContent("setup.sh", "echo ready".repeat(10))).toEqual({
            valid: false,
            message: "generated/setup.sh is not a usable bash script"
        });

        expect(validateGeneratedScriptContent("validation.sh", "#!/bin/bash\n")).toEqual({
            valid: false,
            message: "generated/validation.sh is not a usable bash script"
        });
    });
});
