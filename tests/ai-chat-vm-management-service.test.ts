import { describe, expect, it } from "vitest";
import { AIChatVMManagementService } from "../src/modules/ai-chat/AIChatVMManagementService";
import { AIChatVMInventoryItem } from "../src/modules/ai-chat/AIChatVMResponsePolicy";
import { createResponse } from "../src/utils/resp";

const userId = "507f1f77bcf86cd799439061";
const otherUserId = "507f1f77bcf86cd799439062";

const inventory: AIChatVMInventoryItem[] = [
    {
        vm_id: "507f1f77bcf86cd799439071",
        pve_vmid: "101",
        pve_node: "pve-a",
        name: "web-lab",
        owner_id: userId,
        owner: "student",
        status: "running"
    }
];

function makeUser(id = userId) {
    return {
        _id: { toString: () => id },
        role: "admin",
        owned_vms: [inventory[0].vm_id]
    } as any;
}

function makeService(options: {
    action?: any;
    executorResult?: ReturnType<typeof createResponse>;
    pendingActions?: Map<string, any>;
    now?: () => number;
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const service = new AIChatVMManagementService({
        inventoryLoader: async (user) => {
            calls.push({ method: "inventoryLoader", args: [user] });
            return inventory;
        },
        actionInterpreter: async (userInput, vmInventory, currentVmId) => {
            calls.push({ method: "actionInterpreter", args: [userInput, vmInventory, currentVmId] });
            return options.action ?? { intent: "list_vms" };
        },
        actionExecutor: async (context, action, vm) => {
            calls.push({ method: "actionExecutor", args: [context.user._id.toString(), context.isSuperAdmin, action, vm] });
            return options.executorResult ?? createResponse(200, "OK", { status: "running" });
        },
        idFactory: () => "pending-1",
        now: options.now ?? (() => 1_000),
        pendingActions: options.pendingActions
    });

    return { calls, service };
}

describe("AIChatVMManagementService", () => {
    it("lists manageable VMs", async () => {
        const { service } = makeService({ action: { intent: "list_vms" } });

        await expect(service.manage({
            body: { user_input: "list VMs" },
            user: makeUser()
        })).resolves.toMatchObject({
            code: 200,
            message: "VM list generated",
            body: {
                response: expect.stringContaining("VM inventory"),
                vms: inventory
            }
        });
    });

    it("creates pending confirmation for mutating VM actions", async () => {
        const pendingActions = new Map<string, any>();
        const { service } = makeService({
            action: { intent: "reboot", target_pve_vmid: "101" },
            pendingActions
        });

        await expect(service.manage({
            body: { user_input: "reboot pve101" },
            user: makeUser()
        })).resolves.toMatchObject({
            code: 200,
            message: "VM action requires confirmation",
            body: {
                requires_confirmation: true,
                pending_action_id: "pending-1",
                action_summary: expect.stringContaining("Action: reboot")
            }
        });
        expect(pendingActions.get("pending-1")).toMatchObject({
            userId,
            action: { intent: "reboot", target_pve_vmid: "101" },
            vm: inventory[0],
            createdAt: 1_000
        });
    });

    it("executes a confirmed pending action for the owning user", async () => {
        const pendingActions = new Map<string, any>([
            [
                "pending-1",
                {
                    userId,
                    action: { intent: "reboot", target_pve_vmid: "101" },
                    vm: inventory[0],
                    language: "en",
                    createdAt: 1_000,
                    expiresAt: 60_000
                }
            ]
        ]);
        const { service, calls } = makeService({ pendingActions });

        await expect(service.manage({
            body: { confirm_action_id: "pending-1" },
            user: makeUser()
        })).resolves.toMatchObject({
            code: 200,
            message: "VM action executed",
            body: {
                response: expect.stringContaining("Executed reboot")
            }
        });
        expect(pendingActions.has("pending-1")).toBe(false);
        expect(calls.map(call => call.method)).toEqual(["actionExecutor"]);
    });

    it("rejects confirmation from another user", async () => {
        const pendingActions = new Map<string, any>([
            [
                "pending-1",
                {
                    userId,
                    action: { intent: "delete", target_pve_vmid: "101" },
                    vm: inventory[0],
                    language: "en",
                    createdAt: 1_000,
                    expiresAt: 60_000
                }
            ]
        ]);
        const { service } = makeService({ pendingActions });

        await expect(service.manage({
            body: { confirm_action_id: "pending-1" },
            user: makeUser(otherUserId)
        })).resolves.toMatchObject({
            code: 403,
            message: "Pending VM action belongs to another user"
        });
        expect(pendingActions.has("pending-1")).toBe(true);
    });
});
