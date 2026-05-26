import { describe, expect, it } from "vitest";
import {
    AIChatVMInventoryItem,
    buildAIChatVMHelpResponse,
    formatAIChatVMActionResult,
    formatAIChatVMActionSummary,
    formatAIChatVMConfirmation,
    formatAIChatVMInventory,
    formatAIChatVMLabel,
    formatAIChatVMUptime,
    resolveAIChatVMTarget
} from "../src/modules/ai-chat/AIChatVMResponsePolicy";

const inventory: AIChatVMInventoryItem[] = [
    {
        vm_id: "507f1f77bcf86cd799439011",
        pve_vmid: "101",
        pve_node: "pve-a",
        name: "web-lab",
        owner_id: "owner-1",
        owner: "alice",
        status: "running",
        uptime: 3661
    },
    {
        vm_id: "507f1f77bcf86cd799439012",
        pve_vmid: "102",
        pve_node: "pve-a",
        name: "web-backup",
        owner_id: "owner-1",
        owner: "alice",
        status: "stopped"
    }
];

describe("AIChatVMResponsePolicy", () => {
    it("resolves VM targets by explicit ID, current VM, compact selector, and partial name", () => {
        expect(resolveAIChatVMTarget({ intent: "status", vm_id: inventory[0].vm_id }, inventory).vm).toBe(inventory[0]);
        expect(resolveAIChatVMTarget({ intent: "network" }, inventory, inventory[1].vm_id).vm).toBe(inventory[1]);
        expect(resolveAIChatVMTarget({ intent: "boot", target_selector: "pve101" }, inventory).vm).toBe(inventory[0]);
        expect(resolveAIChatVMTarget({ intent: "status", target_name: "backup" }, inventory).vm).toBe(inventory[1]);
    });

    it("returns localized clarification for ambiguous or missing targets", () => {
        const ambiguous = resolveAIChatVMTarget({ intent: "status", target_selector: "web" }, inventory, undefined, "zh-Hant");
        expect(ambiguous.error).toContain("找到多個符合的 VM");
        expect(ambiguous.error).toContain("web-lab");
        expect(ambiguous.error).toContain("web-backup");

        const missing = resolveAIChatVMTarget({ intent: "status", target_selector: "db-lab" }, inventory, undefined, "en");
        expect(missing.error).toBe("I could not identify the target VM. Please specify a VM name, database id, or PVE vmid.");
    });

    it("formats VM labels, uptime, inventory, summaries, and confirmations", () => {
        expect(formatAIChatVMLabel(inventory[0])).toBe("web-lab [db:507f1f77bcf86cd799439011, pve:101@pve-a, owner:alice]");
        expect(formatAIChatVMUptime(3661)).toBe("1h 1m 1s");
        expect(formatAIChatVMInventory(inventory, "en")).toContain("VM inventory (2 total)");
        expect(formatAIChatVMInventory([], "zh-Hant")).toBe("平台資料庫目前沒有註冊 VM。");

        const summary = formatAIChatVMActionSummary({ intent: "reboot" }, inventory[0], "en");
        expect(summary).toContain("Action: reboot");
        expect(formatAIChatVMConfirmation(summary, "en")).toContain("This changes VM state");
    });

    it("caps inventory output at 50 VMs with a suffix", () => {
        const many = Array.from({ length: 52 }, (_, index): AIChatVMInventoryItem => ({
            vm_id: `vm-${index}`,
            pve_vmid: String(200 + index),
            pve_node: "pve-a",
            name: `lab-${index}`,
            owner_id: "owner",
            owner: "owner",
            status: "running"
        }));

        const output = formatAIChatVMInventory(many, "en");
        expect(output).toContain("VM inventory (52 total)");
        expect(output).toContain("...and 2 more VMs.");
        expect(output).not.toContain("lab-51");
    });

    it("formats status, network, mutation success, and failure results", () => {
        expect(formatAIChatVMActionResult({ intent: "status" }, inventory[0], {
            code: 200,
            message: "OK",
            body: { status: "running", uptime: 3661, resourceUsage: { cpu: 12, memory: 2 } }
        }, "zh-Hant")).toContain("狀態：running，運行時間 1h 1m 1s，CPU 12%，記憶體 2GB。");

        expect(formatAIChatVMActionResult({ intent: "network" }, inventory[0], {
            code: 200,
            message: "OK",
            body: { interfaces: [{ name: "eth0", ipAddresses: [], macAddress: "aa:bb" }] }
        }, "en")).toContain("- eth0: no IP (aa:bb)");

        expect(formatAIChatVMActionResult({ intent: "boot" }, inventory[0], {
            code: 200,
            message: "started",
            body: { upid: "UPID:test" }
        }, "en")).toContain("UPID: UPID:test");

        expect(formatAIChatVMActionResult({ intent: "delete" }, inventory[0], {
            code: 403,
            message: "Access denied"
        }, "en")).toContain("Failed to delete web-lab");
    });

    it("localizes VM help reasons", () => {
        expect(buildAIChatVMHelpResponse("zh-Hant", "No supported VM operation was detected.")).toContain("我沒有辨識出可支援的 VM 操作");
        expect(buildAIChatVMHelpResponse("en", "custom reason")).toContain("custom reason");
    });
});
