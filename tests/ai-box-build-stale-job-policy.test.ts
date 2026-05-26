import { describe, expect, it } from "vitest";
import {
    aiBoxBuildLastActivityAt,
    buildAIBoxBuildStaleRunMessage,
    latestAIBoxRunLogAt,
    selectStaleAIBoxBuildJobIds
} from "../src/modules/ai-box-build/AIBoxBuildStaleJobPolicy";

describe("AIBoxBuildStaleJobPolicy", () => {
    it("uses the latest valid run log timestamp", () => {
        expect(latestAIBoxRunLogAt([
            { stage: "run", level: "info", message: "old", created_at: new Date("2026-05-26T00:00:00.000Z") },
            { stage: "run", level: "info", message: "new", created_at: new Date("2026-05-26T00:05:00.000Z") },
            { stage: "run", level: "info", message: "invalid", created_at: new Date("invalid") }
        ])).toEqual(new Date("2026-05-26T00:05:00.000Z"));
    });

    it("falls back to job updated_at when there are no valid run logs", () => {
        expect(aiBoxBuildLastActivityAt({
            _id: "job-1",
            run_logs: [],
            updated_at: new Date("2026-05-26T00:03:00.000Z")
        } as any)).toEqual(new Date("2026-05-26T00:03:00.000Z"));
    });

    it("selects stale jobs while skipping running jobs", () => {
        const cutoff = new Date("2026-05-26T00:10:00.000Z");
        const staleIds = selectStaleAIBoxBuildJobIds([
            { _id: "stale", run_logs: [], updated_at: new Date("2026-05-26T00:00:00.000Z") },
            { _id: "fresh", run_logs: [{ stage: "run", level: "info", message: "ok", created_at: new Date("2026-05-26T00:12:00.000Z") }], updated_at: new Date("2026-05-26T00:00:00.000Z") },
            { _id: "running", run_logs: [], updated_at: new Date("2026-05-26T00:00:00.000Z") }
        ] as any[], cutoff, new Set(["running"]));

        expect(staleIds).toEqual(["stale"]);
    });

    it("builds stale run messages in minutes", () => {
        expect(buildAIBoxBuildStaleRunMessage(15 * 60 * 1000)).toBe(
            "AI build worker appears stalled or was interrupted; no execution activity for more than 15 minutes. Restart the run after reviewing VM/artifact state."
        );
    });
});
