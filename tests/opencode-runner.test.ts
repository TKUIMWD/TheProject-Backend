import { describe, expect, it } from "vitest";
import { OpenCodeRunner } from "../src/modules/opencode/OpenCodeRunner";

describe("OpenCodeRunner", () => {
    it("runs commands and captures stdout/stderr", async () => {
        const runner = new OpenCodeRunner();

        const result = await runner.runCommand(process.execPath, [
            "-e",
            "process.stdout.write('ok'); process.stderr.write('warn')"
        ], { timeoutMs: 5000 });

        expect(result).toEqual({
            exitCode: 0,
            stdout: "ok",
            stderr: "warn",
            timedOut: false
        });
    });

    it("summarizes command results with timeout and output details", () => {
        const runner = new OpenCodeRunner();

        const summary = runner.summarizeCommandResult("opencode run", {
            exitCode: null,
            stdout: "hello",
            stderr: "problem",
            timedOut: true
        });

        expect(summary).toContain("opencode run exit=unknown timeout=true");
        expect(summary).toContain("stdout:\nhello");
        expect(summary).toContain("stderr:\nproblem");
    });
});
