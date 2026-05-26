import { describe, expect, it } from "vitest";
import { env } from "../src/config/env";
import {
    appendAIBoxRunLog,
    buildAIBoxRunLogPushUpdate,
    makeAIBoxRunLog,
    tail
} from "../src/modules/ai-box-build/AIBoxBuildRunLogPolicy";

describe("AIBoxBuildRunLogPolicy", () => {
    it("redacts configured secrets from run log messages", () => {
        const createdAt = new Date("2026-05-26T00:00:00.000Z");
        const log = makeAIBoxRunLog("setup", "error", `failed with password=${env.database.password}`, { now: createdAt });

        expect(log).toEqual({
            stage: "setup",
            level: "error",
            message: "failed with password=[redacted]",
            created_at: createdAt
        });
    });

    it("keeps only the tail of long messages", () => {
        expect(tail("1234567890", 4)).toBe("7890");
        expect(makeAIBoxRunLog("run", "info", "abcdefghij", { maxLength: 3 }).message).toBe("hij");
    });

    it("appends in-memory logs while keeping only recent previous entries", () => {
        const now = new Date("2026-05-26T00:00:00.000Z");
        const logs = [
            makeAIBoxRunLog("old-1", "info", "old 1", { now }),
            makeAIBoxRunLog("old-2", "warning", "old 2", { now }),
            makeAIBoxRunLog("old-3", "error", "old 3", { now })
        ];

        expect(appendAIBoxRunLog(logs, "run", "info", "new", {
            keepPrevious: 2,
            now
        })).toEqual([
            logs[1],
            logs[2],
            {
                stage: "run",
                level: "info",
                message: "new",
                created_at: now
            }
        ]);
    });

    it("builds Mongo push updates for persisted run logs", () => {
        const now = new Date("2026-05-26T00:00:00.000Z");

        expect(buildAIBoxRunLogPushUpdate("run", "error", `secret ${env.database.password}`, {
            limit: 10,
            now
        })).toEqual({
            $push: {
                run_logs: {
                    $each: [{
                        stage: "run",
                        level: "error",
                        message: "secret [redacted]",
                        created_at: now
                    }],
                    $slice: -10
                }
            }
        });
    });
});
