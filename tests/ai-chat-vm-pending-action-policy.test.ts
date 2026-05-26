import { describe, expect, it } from "vitest";
import {
    buildPendingVMActionTiming,
    collectExpiredPendingVMActionIds,
    DEFAULT_PENDING_VM_ACTION_TTL_MS
} from "../src/modules/ai-chat/AIChatVMPendingActionPolicy";

describe("AIChatVMPendingActionPolicy", () => {
    it("builds pending action timing with the default confirmation TTL", () => {
        expect(buildPendingVMActionTiming(1_000)).toEqual({
            createdAt: 1_000,
            expiresAt: 1_000 + DEFAULT_PENDING_VM_ACTION_TTL_MS
        });
    });

    it("allows custom TTL values for future persistence adapters", () => {
        expect(buildPendingVMActionTiming(1_000, 30_000)).toEqual({
            createdAt: 1_000,
            expiresAt: 31_000
        });
    });

    it("collects expired and malformed pending action IDs", () => {
        expect(collectExpiredPendingVMActionIds([
            ["expired", { expiresAt: 999 }],
            ["expires-now", { expiresAt: 1_000 }],
            ["active", { expiresAt: 1_001 }],
            ["malformed", { expiresAt: "soon" }]
        ], 1_000)).toEqual(["expired", "expires-now", "malformed"]);
    });
});
