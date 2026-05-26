import { describe, expect, it } from "vitest";
import {
    classifierOutputToVMAction,
    interpretVMManagementFallback,
    normalizeVMIntent,
    parseVMClassifierOutput
} from "../src/modules/ai-chat/AIChatVMIntentPolicy";

describe("AIChatVMIntentPolicy", () => {
    it("normalizes classifier intent aliases", () => {
        expect(normalizeVMIntent("list")).toBe("list_vms");
        expect(normalizeVMIntent("network info")).toBe("network");
        expect(normalizeVMIntent("start")).toBe("boot");
        expect(normalizeVMIntent("force-stop")).toBe("poweroff");
        expect(normalizeVMIntent("destroy")).toBe("delete");
        expect(normalizeVMIntent("unknown")).toBe("help");
    });

    it("parses deterministic fallback VM intents", () => {
        expect(interpretVMManagementFallback("show VM status").intent).toBe("status");
        expect(interpretVMManagementFallback("show network ip").intent).toBe("network");
        expect(interpretVMManagementFallback("please reboot this vm").intent).toBe("reboot");
        expect(interpretVMManagementFallback("請幫我開機").intent).toBe("boot");
        expect(interpretVMManagementFallback("刪除這台 VM").intent).toBe("delete");
    });

    it("keeps current VM context and confidence metadata", () => {
        expect(interpretVMManagementFallback("shutdown it", "507f1f77bcf86cd799439011")).toEqual({
            intent: "shutdown",
            vm_id: "507f1f77bcf86cd799439011",
            target_selector: "shutdown it",
            confidence: 0.55,
            reason: "Parsed by deterministic fallback."
        });
    });

    it("falls back to help for unsupported requests", () => {
        expect(interpretVMManagementFallback("build a new cyber range")).toEqual({
            intent: "help",
            target_selector: "build a new cyber range",
            confidence: 0.2,
            reason: "No supported VM operation was detected."
        });
    });

    it("parses classifier JSON directly or from surrounding model text", () => {
        expect(parseVMClassifierOutput('{"action":"status","target":{"vm_id":"vm-1"}}')).toEqual({
            action: "status",
            target: { vm_id: "vm-1" }
        });
        expect(parseVMClassifierOutput('Sure:\n{"intent":"network","confidence":0.8}\nDone')).toEqual({
            intent: "network",
            confidence: 0.8
        });
        expect(parseVMClassifierOutput("no json here")).toBeNull();
        expect(parseVMClassifierOutput("{bad json}")).toBeNull();
    });

    it("normalizes classifier output into VM actions", () => {
        expect(classifierOutputToVMAction({
            action: "force-stop",
            target: {
                vm_id: "vm-1",
                pve_vmid: "101",
                name: "web",
                selector: "web vm"
            },
            confidence: 0.9,
            reason: "matched name"
        })).toEqual({
            intent: "poweroff",
            vm_id: "vm-1",
            target_pve_vmid: "101",
            target_name: "web",
            target_selector: "web vm",
            confidence: 0.9,
            reason: "matched name"
        });
    });
});
