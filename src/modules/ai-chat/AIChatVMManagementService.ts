import { Request } from "express";
import { randomUUID } from "crypto";
import Roles from "../../enum/role";
import { User } from "../../interfaces/User";
import { VMModel } from "../../orm/schemas/VM/VMSchemas";
import { UsersModel } from "../../orm/schemas/UserSchemas";
import { logger } from "../../middlewares/log";
import { AIVMManagementPrompts } from "../../utils/AI_Prompts/AIVMManagementPrompts";
import { VMUtils } from "../../utils/VMUtils";
import { createResponse, resp } from "../../utils/resp";
import { openAIClientFactory } from "../openai/OpenAIClientFactory";
import { VMManageService } from "../../service/VMManageService";
import { VMOperateService } from "../../service/VMOperateService";
import { VMService } from "../../service/VMService";
import {
    sanitizeAIChatUserInput,
    validateAIChatUserInput,
    validateOptionalCurrentVMId
} from "./AIChatRequestPolicy";
import {
    AIResponseLanguage,
    detectResponseLanguage
} from "./AIChatLanguagePolicy";
import {
    AIVMManagementAction,
    AIVMManagementIntent,
    classifierOutputToVMAction,
    interpretVMManagementFallback,
    parseVMClassifierOutput
} from "./AIChatVMIntentPolicy";
import {
    AIChatVMInventoryItem,
    buildAIChatVMHelpResponse,
    buildAIChatVMTargetNotFoundMessage,
    formatAIChatVMActionResult,
    formatAIChatVMActionSummary,
    formatAIChatVMConfirmation,
    formatAIChatVMInventory,
    resolveAIChatVMTarget
} from "./AIChatVMResponsePolicy";
import {
    buildPendingVMActionTiming,
    collectExpiredPendingVMActionIds
} from "./AIChatVMPendingActionPolicy";

type AIVMInventoryItem = AIChatVMInventoryItem;
type AIVMAction = AIVMManagementAction;

interface PendingAIVMAction {
    userId: string;
    action: AIVMAction;
    vm: AIVMInventoryItem;
    language: AIResponseLanguage;
    createdAt: number;
    expiresAt: number;
}

export interface AIVMManagementResponse {
    response: string;
    requires_confirmation?: boolean;
    pending_action_id?: string;
    action_summary?: string;
    result?: {
        code: number;
        message: string;
        body?: unknown;
    };
    vms?: AIVMInventoryItem[];
}

type AIChatVMManagementServiceDeps = {
    inventoryLoader?: (user: User) => Promise<AIVMInventoryItem[]>;
    actionInterpreter?: (userInput: string, inventory: AIVMInventoryItem[], currentVmId?: string) => Promise<AIVMAction>;
    actionExecutor?: (req: Request, action: AIVMAction, vm: AIVMInventoryItem) => Promise<resp<unknown>>;
    idFactory?: () => string;
    now?: () => number;
    pendingActions?: Map<string, PendingAIVMAction>;
    vmOperateService?: VMOperateService;
    vmManageService?: VMManageService;
    vmService?: VMService;
};

const MUTATING_VM_INTENTS = new Set<AIVMManagementIntent>(['boot', 'shutdown', 'poweroff', 'reboot', 'reset', 'delete']);

export class AIChatVMManagementService {
    private readonly inventoryLoader?: (user: User) => Promise<AIVMInventoryItem[]>;
    private readonly actionInterpreter?: (userInput: string, inventory: AIVMInventoryItem[], currentVmId?: string) => Promise<AIVMAction>;
    private readonly actionExecutor?: (req: Request, action: AIVMAction, vm: AIVMInventoryItem) => Promise<resp<unknown>>;
    private readonly idFactory: () => string;
    private readonly now: () => number;
    private readonly pendingActions: Map<string, PendingAIVMAction>;
    private readonly vmOperateService: VMOperateService;
    private readonly vmManageService: VMManageService;
    private readonly vmService: VMService;

    constructor(deps: AIChatVMManagementServiceDeps = {}) {
        this.inventoryLoader = deps.inventoryLoader;
        this.actionInterpreter = deps.actionInterpreter;
        this.actionExecutor = deps.actionExecutor;
        this.idFactory = deps.idFactory ?? randomUUID;
        this.now = deps.now ?? Date.now;
        this.pendingActions = deps.pendingActions ?? new Map<string, PendingAIVMAction>();
        this.vmOperateService = deps.vmOperateService ?? new VMOperateService();
        this.vmManageService = deps.vmManageService ?? new VMManageService();
        this.vmService = deps.vmService ?? new VMService();
    }

    public async manage(input: {
        req: Request;
        user: User;
    }): Promise<resp<AIVMManagementResponse | undefined>> {
        const actingUserId = input.user._id?.toString();
        if (!actingUserId) {
            return createResponse(401, "Invalid admin user");
        }

        const { user_input, current_vm_id, confirm_action_id } = input.req.body;
        if (confirm_action_id) {
            return this.confirmPendingVMAction(input.req, actingUserId, String(confirm_action_id));
        }

        const inputResult = validateAIChatUserInput(user_input);
        if (!inputResult.valid) {
            return createResponse(400, inputResult.message === "user_input must be a non-empty string"
                ? "Missing required field: user_input is required"
                : inputResult.message);
        }

        const currentVMIdResult = validateOptionalCurrentVMId(current_vm_id);
        if (!currentVMIdResult.valid) {
            return createResponse(400, currentVMIdResult.message);
        }

        const sanitizedInput = sanitizeAIChatUserInput(inputResult.input);
        const responseLanguage = detectResponseLanguage(sanitizedInput);
        const inventory = await this.loadVMInventory(input.user);
        const action = await this.interpretVMManagementRequest(sanitizedInput, inventory, currentVMIdResult.vmId);

        if (action.intent === 'help') {
            return createResponse(200, "VM management guidance generated", {
                response: buildAIChatVMHelpResponse(responseLanguage, action.reason),
                vms: inventory
            });
        }

        if (action.intent === 'list_vms') {
            return createResponse(200, "VM list generated", {
                response: formatAIChatVMInventory(inventory, responseLanguage),
                vms: inventory
            });
        }

        const targetResult = resolveAIChatVMTarget(action, inventory, currentVMIdResult.vmId, responseLanguage);
        if (targetResult.error || !targetResult.vm) {
            return createResponse(200, "VM target needs clarification", {
                response: targetResult.error || buildAIChatVMTargetNotFoundMessage(responseLanguage),
                vms: inventory
            });
        }

        if (MUTATING_VM_INTENTS.has(action.intent)) {
            const pendingActionId = this.createPendingVMAction(actingUserId, action, targetResult.vm, responseLanguage);
            const actionSummary = formatAIChatVMActionSummary(action, targetResult.vm, responseLanguage);
            return createResponse(200, "VM action requires confirmation", {
                response: formatAIChatVMConfirmation(actionSummary, responseLanguage),
                requires_confirmation: true,
                pending_action_id: pendingActionId,
                action_summary: actionSummary
            });
        }

        const result = await this.executeVMAction(input.req, action, targetResult.vm);
        return createResponse(200, "VM action completed", {
            response: formatAIChatVMActionResult(action, targetResult.vm, result, responseLanguage),
            result: {
                code: result.code,
                message: result.message,
                body: result.body
            }
        });
    }

    private async confirmPendingVMAction(req: Request, actingUserId: string, pendingActionId: string): Promise<resp<AIVMManagementResponse | undefined>> {
        this.prunePendingVMActions();

        const pending = this.pendingActions.get(pendingActionId);
        if (!pending) {
            return createResponse(404, "Pending VM action not found or expired");
        }

        if (pending.userId !== actingUserId) {
            return createResponse(403, "Pending VM action belongs to another user");
        }

        this.pendingActions.delete(pendingActionId);
        const result = await this.executeVMAction(req, pending.action, pending.vm);

        return createResponse(200, "VM action executed", {
            response: formatAIChatVMActionResult(pending.action, pending.vm, result, pending.language),
            result: {
                code: result.code,
                message: result.message,
                body: result.body
            }
        });
    }

    private async loadVMInventory(user: User): Promise<AIVMInventoryItem[]> {
        if (this.inventoryLoader) {
            return this.inventoryLoader(user);
        }

        const userId = user._id?.toString() || "";
        const query = user.role === Roles.SuperAdmin
            ? {}
            : {
                $or: [
                    { owner: userId },
                    { _id: { $in: user.owned_vms || [] } }
                ]
            };
        const vms = await VMModel.find(query).exec();
        const ownerIds = Array.from(new Set(vms.map((vm) => vm.owner).filter(Boolean)));
        const owners = await UsersModel.find({ _id: { $in: ownerIds } }).exec();
        const ownerMap = new Map<string, string>();
        owners.forEach((owner) => ownerMap.set(owner._id.toString(), owner.username));

        const inventory = await Promise.all(vms.map(async (vm): Promise<AIVMInventoryItem> => {
            const [status, config] = await Promise.all([
                VMUtils.getVMStatus(vm.pve_node, vm.pve_vmid).catch(() => null),
                VMUtils.getCurrentVMConfig(vm.pve_node, vm.pve_vmid).catch(() => null)
            ]);

            return {
                vm_id: vm._id.toString(),
                pve_vmid: vm.pve_vmid,
                pve_node: vm.pve_node,
                name: config?.name || `vm-${vm.pve_vmid}`,
                owner_id: vm.owner,
                owner: ownerMap.get(vm.owner) || vm.owner,
                status: status?.status || 'unknown',
                uptime: status?.uptime
            };
        }));

        return inventory.sort((a, b) => Number(a.pve_vmid) - Number(b.pve_vmid));
    }

    private async interpretVMManagementRequest(userInput: string, inventory: AIVMInventoryItem[], currentVmId?: string): Promise<AIVMAction> {
        if (this.actionInterpreter) {
            return this.actionInterpreter(userInput, inventory, currentVmId);
        }

        try {
            const inventoryForPrompt = inventory.slice(0, 80).map((vm) => ({
                vm_id: vm.vm_id,
                pve_vmid: vm.pve_vmid,
                pve_node: vm.pve_node,
                name: vm.name,
                owner: vm.owner,
                status: vm.status
            }));

            const openai = openAIClientFactory.createChatClient({
                maxRetries: 2,
                timeoutMs: 30 * 1000
            });

            const completion = await openai.chat.completions.create({
                model: openAIClientFactory.chatModel(),
                messages: [
                    { role: 'system', content: AIVMManagementPrompts.SYSTEM_INIT },
                    { role: 'user', content: AIVMManagementPrompts.buildCommandPrompt(JSON.stringify(inventoryForPrompt), currentVmId, userInput) }
                ],
                max_completion_tokens: 500,
            });

            const raw = completion.choices[0]?.message?.content || '';
            const parsed = parseVMClassifierOutput(raw);
            if (parsed) {
                const classifierAction = classifierOutputToVMAction(parsed);
                const fallbackAction = interpretVMManagementFallback(userInput, currentVmId);
                if (
                    classifierAction.intent === 'help'
                    && fallbackAction.intent !== 'help'
                    && (classifierAction.confidence === undefined || classifierAction.confidence < 0.75)
                ) {
                    return fallbackAction;
                }
                return classifierAction;
            }
        } catch (error) {
            logger.warn("AI VM management classifier failed, falling back to deterministic parser:", error);
        }

        return interpretVMManagementFallback(userInput, currentVmId);
    }

    private async executeVMAction(req: Request, action: AIVMAction, vm: AIVMInventoryItem): Promise<resp<unknown>> {
        if (this.actionExecutor) {
            return this.actionExecutor(req, action, vm);
        }

        switch (action.intent) {
            case 'status':
                return await this.vmService.getVMStatus(this.cloneRequest(req, {}, { vm_id: vm.vm_id })) as resp<unknown>;
            case 'network':
                return await this.vmService.getVMNetworkInfo(this.cloneRequest(req, {}, { vm_id: vm.vm_id })) as resp<unknown>;
            case 'boot':
                return await this.vmOperateService.bootVM(this.cloneRequest(req, { vm_id: vm.vm_id })) as resp<unknown>;
            case 'shutdown':
                return await this.vmOperateService.shutdownVM(this.cloneRequest(req, { vm_id: vm.vm_id })) as resp<unknown>;
            case 'poweroff':
                return await this.vmOperateService.poweroffVM(this.cloneRequest(req, { vm_id: vm.vm_id })) as resp<unknown>;
            case 'reboot':
                return await this.vmOperateService.rebootVM(this.cloneRequest(req, { vm_id: vm.vm_id })) as resp<unknown>;
            case 'reset':
                return await this.vmOperateService.resetVM(this.cloneRequest(req, { vm_id: vm.vm_id })) as resp<unknown>;
            case 'delete':
                return await this.vmManageService.deleteUserVM(this.cloneRequest(req, { vm_id: vm.vm_id })) as resp<unknown>;
            default:
                return createResponse(400, "Unsupported VM action");
        }
    }

    private cloneRequest(req: Request, body: Record<string, unknown>, query: Record<string, unknown> = {}): Request {
        return {
            ...req,
            headers: req.headers,
            body,
            query
        } as Request;
    }

    private createPendingVMAction(userId: string, action: AIVMAction, vm: AIVMInventoryItem, language: AIResponseLanguage): string {
        this.prunePendingVMActions();
        const id = this.idFactory();
        const timing = buildPendingVMActionTiming(this.now());
        this.pendingActions.set(id, {
            userId,
            action,
            vm,
            language,
            ...timing
        });
        return id;
    }

    private prunePendingVMActions(): void {
        for (const id of collectExpiredPendingVMActionIds(this.pendingActions.entries(), this.now())) {
            this.pendingActions.delete(id);
        }
    }
}

export const aiChatVMManagementService = new AIChatVMManagementService();
