import { Service } from "../abstract/Service";
import { Request } from "express";
import { resp, createResponse } from "../utils/resp";
import { validateTokenAndGetUser, getTokenRole, validateTokenAndGetAdminUser, validateTokenAndGetSuperAdminUser } from "../utils/auth";
import { VMBoxModel } from "../orm/schemas/VM/VMBoxSchemas";
import { VMModel } from "../orm/schemas/VM/VMSchemas";
import { User } from "../interfaces/User";
import { logger } from "../middlewares/log";
import { PentestBoxPrompts } from "../utils/AI_Prompts/PentestBoxPrompts";
import { PlatformGuidePrompts } from "../utils/AI_Prompts/PlatformGuidePrompts";
import { AIVMManagementPrompts } from "../utils/AI_Prompts/AIVMManagementPrompts";
import { OpenAI } from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import Roles from "../enum/role";
import { VMOperateService } from "./VMOperateService";
import { VMManageService } from "./VMManageService";
import { VMService } from "./VMService";
import { UsersModel } from "../orm/schemas/UserSchemas";
import { VMUtils } from "../utils/VMUtils";
import { randomUUID } from "crypto";

type AIVMManagementIntent = 'help' | 'list_vms' | 'status' | 'network' | 'boot' | 'shutdown' | 'poweroff' | 'reboot' | 'reset' | 'delete';
type AIResponseLanguage = 'zh-Hant' | 'zh-Hans' | 'ja' | 'ko' | 'en';

interface AIVMInventoryItem {
    vm_id: string;
    pve_vmid: string;
    pve_node: string;
    name: string;
    owner_id: string;
    owner: string;
    status: string;
    uptime?: number;
}

interface AIVMClassifierTarget {
    vm_id?: string;
    pve_vmid?: string;
    name?: string;
    selector?: string;
}

interface AIVMClassifierOutput {
    action?: string;
    intent?: string;
    target?: AIVMClassifierTarget;
    confidence?: number;
    reason?: string;
}

interface AIVMAction {
    intent: AIVMManagementIntent;
    vm_id?: string;
    target_pve_vmid?: string;
    target_name?: string;
    target_selector?: string;
    confidence?: number;
    reason?: string;
}

interface PendingAIVMAction {
    userId: string;
    action: AIVMAction;
    vm: AIVMInventoryItem;
    language: AIResponseLanguage;
    createdAt: number;
    expiresAt: number;
}

interface AIVMManagementResponse {
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


export class AIChatService extends Service {

    private static readonly MUTATING_VM_INTENTS = new Set<AIVMManagementIntent>(['boot', 'shutdown', 'poweroff', 'reboot', 'reset', 'delete']);
    private static readonly pendingVmActions = new Map<string, PendingAIVMAction>();

    private _platformGuideContent: string | null = null;
    private readonly _vmOperateService = new VMOperateService();
    private readonly _vmManageService = new VMManageService();
    private readonly _vmService = new VMService();

    private async _loadPlatformGuide(): Promise<string> {
        if (this._platformGuideContent) {
            return this._platformGuideContent;
        }

        try {
            const guidePath = path.join(__dirname, '../../docs/PLATFORM_GUIDE.md');
            this._platformGuideContent = fs.readFileSync(guidePath, 'utf-8');
            return this._platformGuideContent;
        } catch (error) {
            logger.error('Error loading platform guide:', error);
            return 'Platform guide not available. Please contact support.';
        }
    }

    public async *getBoxHintStream(Request: Request): AsyncGenerator<string, void, unknown> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                logger.error("Error validating token for getBoxHintStream:", error);
                yield JSON.stringify({ error: error.message, code: error.code });
                return;
            }

            const { vm_id, user_input } = Request.body;

            if (!vm_id || !user_input) {
                yield JSON.stringify({ 
                    error: 'Missing required fields: vm_id and user_input are required',
                    code: 400 
                });
                return;
            }

            if (typeof user_input !== 'string' || user_input.trim().length === 0) {
                yield JSON.stringify({ 
                    error: 'user_input must be a non-empty string',
                    code: 400 
                });
                return;
            }

            if (user_input.length > 2000) {
                yield JSON.stringify({ 
                    error: 'user_input exceeds maximum length of 2000 characters',
                    code: 400 
                });
                return;
            }

            const vm = await VMModel.findById(vm_id).exec();
            if (!vm) {
                yield JSON.stringify({ error: 'VM not found', code: 404 });
                return;
            }

            if (user.role !== Roles.SuperAdmin && vm.owner !== user._id.toString()) {
                yield JSON.stringify({ 
                    error: 'You do not have permission to access this VM',
                    code: 403 
                });
                return;
            }

            if (!vm.is_box_vm || !vm.box_id) {
                yield JSON.stringify({ 
                    error: 'This VM is not associated with a Box challenge',
                    code: 400 
                });
                return;
            }

            const box = await VMBoxModel.findById(vm.box_id).exec();
            if (!box) {
                yield JSON.stringify({ error: 'Associated Box not found', code: 404 });
                return;
            }

            if (box.allow_ai_assistant === false) {
                yield JSON.stringify({ error: 'This Box has disabled AI assistant hints', code: 403 });
                return;
            }

            logger.info(`User ${user.username} (${user._id}) requesting AI hint for VM ${vm_id}, Box ${vm.box_id}`);

            const sanitizedInput = this._sanitizeUserInput(user_input);
            const boxHintContext = box.design_md || box.box_setup_description || 'Complete the security challenge';
            const systemPrompt = `${PentestBoxPrompts.SYSTEM_INIT}\n\n${this._buildLanguageInstruction(sanitizedInput)}`;
            const userPrompt = PentestBoxPrompts.buildHintPrompt(
                boxHintContext,
                sanitizedInput
            );

            let OpenAI: any;
            try {
                OpenAI = (await import('openai')).default;
            } catch (importError) {
                logger.error('OpenAI module not installed:', importError);
                yield JSON.stringify({ 
                    error: 'OpenAI service not available. Please install openai package.',
                    code: 500 
                });
                return;
            }

            const openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY,
                baseURL: process.env.OPENAI_BASE_URL,
                maxRetries: 3,
                timeout: 60 * 1000,
            });

            const model = process.env.OPENAI_MODEL || 'gpt-4o';

            const stream = await openai.chat.completions.create({
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                stream: true,
                max_completion_tokens: 2000,
            });

            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content;
                if (content) {
                    yield content;
                }
            }

            logger.info(`AI hint generated successfully for VM ${vm_id}, Box ${vm.box_id}, User ${user.username}`);

        } catch (error) {
            logger.error('Error in getBoxHintStream:', error);
            yield JSON.stringify({ 
                error: 'Internal server error while generating hint',
                code: 500 
            });
        }
    }

    public async getBoxHint(Request: Request): Promise<resp<{ hint: string } | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                logger.error("Error validating token for getBoxHint:", error);
                return createResponse(error.code, error.message);
            }

            const { vm_id, user_input } = Request.body;

            if (!vm_id || !user_input) {
                return createResponse(400, 'Missing required fields: vm_id and user_input are required');
            }

            if (typeof user_input !== 'string' || user_input.trim().length === 0) {
                return createResponse(400, 'user_input must be a non-empty string');
            }

            if (user_input.length > 2000) {
                return createResponse(400, 'user_input exceeds maximum length of 2000 characters');
            }

            const vm = await VMModel.findById(vm_id).exec();
            if (!vm) {
                return createResponse(404, 'VM not found');
            }

            if (user.role !== Roles.SuperAdmin && vm.owner !== user._id.toString()) {
                return createResponse(403, 'You do not have permission to access this VM');
            }

            if (!vm.is_box_vm || !vm.box_id) {
                return createResponse(400, 'This VM is not associated with a Box challenge');
            }

            const box = await VMBoxModel.findById(vm.box_id).exec();
            if (!box) {
                return createResponse(404, 'Associated Box not found');
            }

            if (box.allow_ai_assistant === false) {
                return createResponse(403, 'This Box has disabled AI assistant hints');
            }

            logger.info(`User ${user.username} (${user._id}) requesting AI hint (non-stream) for VM ${vm_id}, Box ${vm.box_id}`);

            const sanitizedInput = this._sanitizeUserInput(user_input);
            const boxHintContext = box.design_md || box.box_setup_description || 'Complete the security challenge';
            const systemPrompt = `${PentestBoxPrompts.SYSTEM_INIT}\n\n${this._buildLanguageInstruction(sanitizedInput)}`;
            const userPrompt = PentestBoxPrompts.buildHintPrompt(
                boxHintContext,
                sanitizedInput
            );

            const openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY,
                baseURL: process.env.OPENAI_BASE_URL,
                maxRetries: 3,
                timeout: 60 * 1000,
            });

            const model = process.env.OPENAI_MODEL || 'gpt-4o';

            const completion = await openai.chat.completions.create({
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                max_completion_tokens: 2000,
            });

            const hint = completion.choices[0]?.message?.content || 'Unable to generate hint at this time.';

            logger.info(`AI hint generated successfully (non-stream) for VM ${vm_id}, Box ${vm.box_id}, User ${user.username}`);

            return createResponse(200, 'Hint generated successfully', { hint });

        } catch (error) {
            logger.error('Error in getBoxHint:', error);
            return createResponse(500, 'Internal server error while generating hint');
        }
    }

    private _sanitizeUserInput(input: string): string {
        let sanitized = input.trim();
        
        const injectionPatterns = [
            /ignore\s+(all\s+)?previous\s+instructions?/gi,
            /forget\s+(all\s+)?previous\s+(instructions?|prompts?)/gi,
            /you\s+are\s+now/gi,
            /new\s+instructions?:/gi,
            /system\s*:/gi,
            /\[SYSTEM\]/gi,
            /\[INST\]/gi,
            /<!--|-->/g,
            /<\|im_start\|>/gi,
            /<\|im_end\|>/gi,
        ];

        for (const pattern of injectionPatterns) {
            sanitized = sanitized.replace(pattern, '[FILTERED]');
        }

        if (sanitized.length > 2000) {
            sanitized = sanitized.substring(0, 2000);
        }

        return sanitized;
    }

    private _detectResponseLanguage(input: string): AIResponseLanguage {
        if (/[\uAC00-\uD7AF]/.test(input)) {
            return 'ko';
        }

        if (/[\u3040-\u30FF]/.test(input)) {
            return 'ja';
        }

        if (/[\u4E00-\u9FFF]/.test(input)) {
            const simplifiedSignals = /[这为会汉语无与吗国后发复]/;
            const traditionalSignals = /[這為會漢語無與嗎國後發復]/;
            if (simplifiedSignals.test(input) && !traditionalSignals.test(input)) {
                return 'zh-Hans';
            }
            return 'zh-Hant';
        }

        return 'en';
    }

    private _buildLanguageInstruction(userInput: string): string {
        const language = this._detectResponseLanguage(userInput);
        const languageName = this._languageName(language);
        return `LANGUAGE CONTROL:
- Detected response language: ${languageName}.
- Reply in ${languageName} unless the user explicitly asks for a different language.
- If the input mixes languages, use the language of the user's request sentence while preserving technical terms, product names, code, commands, and CVE identifiers as written.
- Do not switch to English just because system context, role context, VM inventory, or Box design context is in English.`;
    }

    private _languageName(language: AIResponseLanguage): string {
        const names: Record<AIResponseLanguage, string> = {
            'zh-Hant': 'Traditional Chinese',
            'zh-Hans': 'Simplified Chinese',
            ja: 'Japanese',
            ko: 'Korean',
            en: 'English'
        };
        return names[language];
    }

    private _isChineseResponse(language: AIResponseLanguage): boolean {
        return language === 'zh-Hant' || language === 'zh-Hans';
    }

    private _isJapaneseResponse(language: AIResponseLanguage): boolean {
        return language === 'ja';
    }

    private _isKoreanResponse(language: AIResponseLanguage): boolean {
        return language === 'ko';
    }

    public async *getPlatformGuideStream(Request: Request): AsyncGenerator<string, void, unknown> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                logger.error("Error validating token for getPlatformGuideStream:", error);
                yield JSON.stringify({ error: error.message, code: error.code });
                return;
            }

            const { user_input } = Request.body;

            if (!user_input) {
                yield JSON.stringify({ 
                    error: 'Missing required field: user_input is required',
                    code: 400 
                });
                return;
            }

            if (typeof user_input !== 'string' || user_input.trim().length === 0) {
                yield JSON.stringify({ 
                    error: 'user_input must be a non-empty string',
                    code: 400 
                });
                return;
            }

            if (user_input.length > 2000) {
                yield JSON.stringify({ 
                    error: 'user_input exceeds maximum length of 2000 characters',
                    code: 400 
                });
                return;
            }

            logger.info(`User ${user.username} (${user._id}) requesting platform guidance (stream)`);

            const platformGuideContent = await this._loadPlatformGuide();
            const { role: userRole, error: roleError } = await getTokenRole(Request);
            
            if (roleError || !userRole) {
                yield JSON.stringify({ 
                    error: roleError?.message || 'Unable to determine user role',
                    code: roleError?.code || 500 
                });
                return;
            }

            const sanitizedInput = this._sanitizeUserInput(user_input);
            
            const systemPrompt = `${PlatformGuidePrompts.SYSTEM_INIT}\n\n${this._buildLanguageInstruction(sanitizedInput)}`;
            const userPrompt = PlatformGuidePrompts.buildPlatformGuidePrompt(
                platformGuideContent,
                userRole,
                sanitizedInput
            );

            const openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY,
                baseURL: process.env.OPENAI_BASE_URL,
                maxRetries: 3,
                timeout: 60 * 1000,
            });

            const model = process.env.OPENAI_MODEL || 'gpt-4o';

            const stream = await openai.chat.completions.create({
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                stream: true,
                max_completion_tokens: 1500,
            });

            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content;
                if (content) {
                    yield content;
                }
            }

            logger.info(`Platform guidance generated successfully (stream) for User ${user.username}`);

        } catch (error) {
            logger.error('Error in getPlatformGuideStream:', error);
            yield JSON.stringify({ 
                error: 'Internal server error while generating guidance',
                code: 500 
            });
        }
    }

    public async getPlatformGuide(Request: Request): Promise<resp<{ response: string } | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                logger.error("Error validating token for getPlatformGuide:", error);
                return createResponse(error.code, error.message);
            }

            const { user_input } = Request.body;

            if (!user_input) {
                return createResponse(400, 'Missing required field: user_input is required');
            }

            if (typeof user_input !== 'string' || user_input.trim().length === 0) {
                return createResponse(400, 'user_input must be a non-empty string');
            }

            if (user_input.length > 2000) {
                return createResponse(400, 'user_input exceeds maximum length of 2000 characters');
            }

            logger.info(`User ${user.username} (${user._id}) requesting platform guidance (non-stream)`);

            const platformGuideContent = await this._loadPlatformGuide();
            const { role: userRole, error: roleError } = await getTokenRole(Request);
            
            if (roleError || !userRole) {
                return createResponse(
                    roleError?.code || 500, 
                    roleError?.message || 'Unable to determine user role'
                );
            }

            const sanitizedInput = this._sanitizeUserInput(user_input);
            
            const systemPrompt = `${PlatformGuidePrompts.SYSTEM_INIT}\n\n${this._buildLanguageInstruction(sanitizedInput)}`;
            const userPrompt = PlatformGuidePrompts.buildPlatformGuidePrompt(
                platformGuideContent,
                userRole,
                sanitizedInput
            );

            const openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY,
                baseURL: process.env.OPENAI_BASE_URL,
                maxRetries: 3,
                timeout: 60 * 1000,
            });

            const model = process.env.OPENAI_MODEL || 'gpt-4o';

            const completion = await openai.chat.completions.create({
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                max_completion_tokens: 1500,
            });

            const response = completion.choices[0]?.message?.content || 'Unable to generate guidance at this time.';

            logger.info(`Platform guidance generated successfully (non-stream) for User ${user.username}`);

            return createResponse(200, 'Guidance generated successfully', { response });

        } catch (error) {
            logger.error('Error in getPlatformGuide:', error);
            return createResponse(500, 'Internal server error while generating guidance');
        }
    }

    public async manageVM(Request: Request): Promise<resp<AIVMManagementResponse | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<User>(Request);
            if (error) {
                logger.error("Error validating token for manageVM:", error);
                return createResponse(error.code, error.message);
            }

            const actingUserId = user._id?.toString();
            if (!actingUserId) {
                return createResponse(401, "Invalid admin user");
            }

            const { user_input, current_vm_id, confirm_action_id } = Request.body;

            if (confirm_action_id) {
                return await this._confirmPendingVMAction(Request, actingUserId, String(confirm_action_id));
            }

            if (!user_input || typeof user_input !== 'string' || user_input.trim().length === 0) {
                return createResponse(400, "Missing required field: user_input is required");
            }

            if (user_input.length > 2000) {
                return createResponse(400, "user_input exceeds maximum length of 2000 characters");
            }

            const sanitizedInput = this._sanitizeUserInput(user_input);
            const responseLanguage = this._detectResponseLanguage(sanitizedInput);
            const inventory = await this._loadVMInventory(user);
            const action = await this._interpretVMManagementRequest(sanitizedInput, inventory, current_vm_id);

            if (action.intent === 'help') {
                return createResponse(200, "VM management guidance generated", {
                    response: this._buildVMHelpResponse(responseLanguage, action.reason),
                    vms: inventory
                });
            }

            if (action.intent === 'list_vms') {
                return createResponse(200, "VM list generated", {
                    response: this._formatVMInventory(inventory, responseLanguage),
                    vms: inventory
                });
            }

            const targetResult = this._resolveVMTarget(action, inventory, typeof current_vm_id === 'string' ? current_vm_id : undefined, responseLanguage);
            if (targetResult.error || !targetResult.vm) {
                return createResponse(200, "VM target needs clarification", {
                    response: targetResult.error || this._vmTargetNotFoundMessage(responseLanguage),
                    vms: inventory
                });
            }

            if (AIChatService.MUTATING_VM_INTENTS.has(action.intent)) {
                const pendingActionId = this._createPendingVMAction(actingUserId, action, targetResult.vm, responseLanguage);
                const actionSummary = this._formatActionSummary(action, targetResult.vm, responseLanguage);
                return createResponse(200, "VM action requires confirmation", {
                    response: this._formatVMConfirmation(actionSummary, responseLanguage),
                    requires_confirmation: true,
                    pending_action_id: pendingActionId,
                    action_summary: actionSummary
                });
            }

            const result = await this._executeVMAction(Request, action, targetResult.vm);
            return createResponse(200, "VM action completed", {
                response: this._formatVMActionResult(action, targetResult.vm, result, responseLanguage),
                result: {
                    code: result.code,
                    message: result.message,
                    body: result.body
                }
            });
        } catch (error) {
            logger.error("Error in manageVM:", error);
            return createResponse(500, "Internal server error while managing VM");
        }
    }

    private async _confirmPendingVMAction(Request: Request, actingUserId: string, pendingActionId: string): Promise<resp<AIVMManagementResponse | undefined>> {
        this._prunePendingVMActions();

        const pending = AIChatService.pendingVmActions.get(pendingActionId);
        if (!pending) {
            return createResponse(404, "Pending VM action not found or expired");
        }

        if (pending.userId !== actingUserId) {
            return createResponse(403, "Pending VM action belongs to another user");
        }

        AIChatService.pendingVmActions.delete(pendingActionId);
        const result = await this._executeVMAction(Request, pending.action, pending.vm);

        return createResponse(200, "VM action executed", {
            response: this._formatVMActionResult(pending.action, pending.vm, result, pending.language),
            result: {
                code: result.code,
                message: result.message,
                body: result.body
            }
        });
    }

    private async _loadVMInventory(user: User): Promise<AIVMInventoryItem[]> {
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

    private async _interpretVMManagementRequest(userInput: string, inventory: AIVMInventoryItem[], currentVmId?: string): Promise<AIVMAction> {
        try {
            const inventoryForPrompt = inventory.slice(0, 80).map((vm) => ({
                vm_id: vm.vm_id,
                pve_vmid: vm.pve_vmid,
                pve_node: vm.pve_node,
                name: vm.name,
                owner: vm.owner,
                status: vm.status
            }));

            const openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY,
                baseURL: process.env.OPENAI_BASE_URL,
                maxRetries: 2,
                timeout: 30 * 1000,
            });

            const completion = await openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || 'gpt-4o',
                messages: [
                    { role: 'system', content: AIVMManagementPrompts.SYSTEM_INIT },
                    { role: 'user', content: AIVMManagementPrompts.buildCommandPrompt(JSON.stringify(inventoryForPrompt), currentVmId, userInput) }
                ],
                max_completion_tokens: 500,
            });

            const raw = completion.choices[0]?.message?.content || '';
            const parsed = this._parseVMClassifierOutput(raw);
            if (parsed) {
                const classifierAction = this._classifierOutputToAction(parsed);
                const fallbackAction = this._fallbackInterpretVMRequest(userInput, currentVmId);
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

        return this._fallbackInterpretVMRequest(userInput, currentVmId);
    }

    private _parseVMClassifierOutput(raw: string): AIVMClassifierOutput | null {
        try {
            return JSON.parse(raw) as AIVMClassifierOutput;
        } catch {
            const match = raw.match(/\{[\s\S]*\}/);
            if (!match) {
                return null;
            }
            try {
                return JSON.parse(match[0]) as AIVMClassifierOutput;
            } catch {
                return null;
            }
        }
    }

    private _classifierOutputToAction(output: AIVMClassifierOutput): AIVMAction {
        const target = output.target || {};
        return {
            intent: this._normalizeVMIntent(output.action || output.intent),
            vm_id: target.vm_id,
            target_pve_vmid: target.pve_vmid,
            target_name: target.name,
            target_selector: target.selector,
            confidence: output.confidence,
            reason: output.reason
        };
    }

    private _fallbackInterpretVMRequest(userInput: string, currentVmId?: string): AIVMAction {
        const text = userInput.toLowerCase();
        let intent: AIVMManagementIntent = 'help';

        if (this._includesAny(text, ['list', 'show all', 'inventory', '\u5217\u51fa', '\u6240\u6709'])) {
            intent = 'list_vms';
        } else if (this._includesAny(text, ['network', 'ip', '\u7db2\u8def'])) {
            intent = 'network';
        } else if (this._includesAny(text, ['status', '\u72c0\u614b'])) {
            intent = 'status';
        } else if (this._includesAny(text, ['reboot', 'restart', '\u91cd\u555f'])) {
            intent = 'reboot';
        } else if (this._includesAny(text, ['reset', '\u91cd\u7f6e'])) {
            intent = 'reset';
        } else if (this._includesAny(text, ['delete', 'remove', 'destroy', '\u522a\u9664'])) {
            intent = 'delete';
        } else if (this._includesAny(text, ['poweroff', 'force stop', 'hard stop', '\u5f37\u5236'])) {
            intent = 'poweroff';
        } else if (this._includesAny(text, ['shutdown', '\u95dc\u6a5f'])) {
            intent = 'shutdown';
        } else if (this._includesAny(text, ['boot', 'start', '\u958b\u6a5f', '\u555f\u52d5'])) {
            intent = 'boot';
        }

        return {
            intent,
            vm_id: currentVmId,
            target_selector: userInput,
            confidence: intent === 'help' ? 0.2 : 0.55,
            reason: intent === 'help' ? 'No supported VM operation was detected.' : 'Parsed by deterministic fallback.'
        };
    }

    private _normalizeVMIntent(intent: string | undefined): AIVMManagementIntent {
        const normalized = (intent || '').toLowerCase().replace(/[\s-]+/g, '_');
        const aliases: Record<string, AIVMManagementIntent> = {
            list: 'list_vms',
            list_vm: 'list_vms',
            list_vms: 'list_vms',
            inventory: 'list_vms',
            ip: 'network',
            network_info: 'network',
            start: 'boot',
            stop: 'poweroff',
            force_stop: 'poweroff',
            hard_stop: 'poweroff',
            graceful_shutdown: 'shutdown',
            restart: 'reboot',
            remove: 'delete',
            destroy: 'delete'
        };

        const supported: AIVMManagementIntent[] = ['help', 'list_vms', 'status', 'network', 'boot', 'shutdown', 'poweroff', 'reboot', 'reset', 'delete'];
        if (supported.includes(normalized as AIVMManagementIntent)) {
            return normalized as AIVMManagementIntent;
        }
        return aliases[normalized] || 'help';
    }

    private _resolveVMTarget(action: AIVMAction, inventory: AIVMInventoryItem[], currentVmId?: string, language: AIResponseLanguage = 'en'): { vm?: AIVMInventoryItem; error?: string } {
        if (action.vm_id) {
            const byId = inventory.find((vm) => vm.vm_id === action.vm_id);
            if (byId) {
                return { vm: byId };
            }
        }

        if (!action.target_pve_vmid && !action.target_name && !action.target_selector && currentVmId) {
            const current = inventory.find((vm) => vm.vm_id === currentVmId);
            if (current) {
                return { vm: current };
            }
        }

        const candidates = new Set<AIVMInventoryItem>();
        const addMatches = (value: string | undefined, matcher: (vm: AIVMInventoryItem, value: string) => boolean) => {
            if (!value) {
                return;
            }
            const normalizedValue = value.trim().toLowerCase();
            if (!normalizedValue) {
                return;
            }
            inventory.filter((vm) => matcher(vm, normalizedValue)).forEach((vm) => candidates.add(vm));
        };

        addMatches(action.target_pve_vmid, (vm, value) => vm.pve_vmid.toLowerCase() === value);
        addMatches(action.target_name, (vm, value) => vm.name.toLowerCase() === value);
        addMatches(action.target_selector, (vm, value) => {
            const pvePattern = new RegExp(`(^|[^0-9])${vm.pve_vmid}([^0-9]|$)`);
            const compactValue = value.replace(/[^a-z0-9]/g, '');
            return (
                vm.vm_id.toLowerCase() === value ||
                vm.pve_vmid.toLowerCase() === value ||
                vm.name.toLowerCase() === value ||
                compactValue === `pve${vm.pve_vmid}` ||
                compactValue === `vmid${vm.pve_vmid}` ||
                pvePattern.test(value)
            );
        });

        if (candidates.size === 0) {
            addMatches(action.target_name, (vm, value) => vm.name.toLowerCase().includes(value));
            addMatches(action.target_selector, (vm, value) => vm.name.toLowerCase().includes(value));
        }

        if (candidates.size === 1) {
            return { vm: Array.from(candidates)[0] };
        }

        if (candidates.size > 1) {
            const options = Array.from(candidates)
                .slice(0, 8)
                .map((vm) => `- ${this._formatVMLabel(vm)}`)
                .join('\n');
            return { error: this._vmMultipleTargetsMessage(options, language) };
        }

        return { error: this._vmTargetNotFoundMessage(language) };
    }

    private async _executeVMAction(Request: Request, action: AIVMAction, vm: AIVMInventoryItem): Promise<resp<unknown>> {
        switch (action.intent) {
            case 'status':
                return await this._vmService.getVMStatus(this._cloneRequest(Request, {}, { vm_id: vm.vm_id })) as resp<unknown>;
            case 'network':
                return await this._vmService.getVMNetworkInfo(this._cloneRequest(Request, {}, { vm_id: vm.vm_id })) as resp<unknown>;
            case 'boot':
                return await this._vmOperateService.bootVM(this._cloneRequest(Request, { vm_id: vm.vm_id })) as resp<unknown>;
            case 'shutdown':
                return await this._vmOperateService.shutdownVM(this._cloneRequest(Request, { vm_id: vm.vm_id })) as resp<unknown>;
            case 'poweroff':
                return await this._vmOperateService.poweroffVM(this._cloneRequest(Request, { vm_id: vm.vm_id })) as resp<unknown>;
            case 'reboot':
                return await this._vmOperateService.rebootVM(this._cloneRequest(Request, { vm_id: vm.vm_id })) as resp<unknown>;
            case 'reset':
                return await this._vmOperateService.resetVM(this._cloneRequest(Request, { vm_id: vm.vm_id })) as resp<unknown>;
            case 'delete':
                return await this._vmManageService.deleteUserVM(this._cloneRequest(Request, { vm_id: vm.vm_id })) as resp<unknown>;
            default:
                return createResponse(400, "Unsupported VM action");
        }
    }

    private _cloneRequest(Request: Request, body: Record<string, unknown>, query: Record<string, unknown> = {}): Request {
        return {
            ...Request,
            headers: Request.headers,
            body,
            query
        } as Request;
    }

    private _createPendingVMAction(userId: string, action: AIVMAction, vm: AIVMInventoryItem, language: AIResponseLanguage): string {
        this._prunePendingVMActions();
        const id = randomUUID();
        const now = Date.now();
        AIChatService.pendingVmActions.set(id, {
            userId,
            action,
            vm,
            language,
            createdAt: now,
            expiresAt: now + 5 * 60 * 1000
        });
        return id;
    }

    private _prunePendingVMActions(): void {
        const now = Date.now();
        for (const [id, action] of AIChatService.pendingVmActions.entries()) {
            if (action.expiresAt <= now) {
                AIChatService.pendingVmActions.delete(id);
            }
        }
    }

    private _formatVMActionResult(action: AIVMAction, vm: AIVMInventoryItem, result: resp<unknown>, language: AIResponseLanguage): string {
        const label = this._formatVMLabel(vm);
        if (result.code !== 200) {
            if (this._isChineseResponse(language)) {
                return `對 ${label} 執行 ${action.intent} 失敗。\n\n後端回應：${result.code} ${result.message}`;
            }
            if (this._isJapaneseResponse(language)) {
                return `${label} に対する ${action.intent} の実行に失敗しました。\n\nバックエンド応答: ${result.code} ${result.message}`;
            }
            if (this._isKoreanResponse(language)) {
                return `${label}에 대해 ${action.intent} 실행에 실패했습니다.\n\n백엔드 응답: ${result.code} ${result.message}`;
            }
            return `Failed to ${action.intent} ${label}.\n\nBackend response: ${result.code} ${result.message}`;
        }

        if (action.intent === 'status') {
            const body = result.body as { status?: string; uptime?: number; resourceUsage?: { cpu?: number; memory?: number } } | undefined;
            const uptime = body?.uptime !== undefined ? `, uptime ${this._formatUptime(body.uptime)}` : '';
            const usage = body?.resourceUsage ? `, CPU ${body.resourceUsage.cpu ?? 0}%, memory ${body.resourceUsage.memory ?? 0}GB` : '';
            if (this._isChineseResponse(language)) {
                const zhUptime = body?.uptime !== undefined ? `，運行時間 ${this._formatUptime(body.uptime)}` : '';
                const zhUsage = body?.resourceUsage ? `，CPU ${body.resourceUsage.cpu ?? 0}%，記憶體 ${body.resourceUsage.memory ?? 0}GB` : '';
                return `${label}\n狀態：${body?.status || 'unknown'}${zhUptime}${zhUsage}。`;
            }
            if (this._isJapaneseResponse(language)) {
                const jaUptime = body?.uptime !== undefined ? `、稼働時間 ${this._formatUptime(body.uptime)}` : '';
                const jaUsage = body?.resourceUsage ? `、CPU ${body.resourceUsage.cpu ?? 0}%、メモリ ${body.resourceUsage.memory ?? 0}GB` : '';
                return `${label}\n状態: ${body?.status || 'unknown'}${jaUptime}${jaUsage}。`;
            }
            if (this._isKoreanResponse(language)) {
                const koUptime = body?.uptime !== undefined ? `, 가동 시간 ${this._formatUptime(body.uptime)}` : '';
                const koUsage = body?.resourceUsage ? `, CPU ${body.resourceUsage.cpu ?? 0}%, 메모리 ${body.resourceUsage.memory ?? 0}GB` : '';
                return `${label}\n상태: ${body?.status || 'unknown'}${koUptime}${koUsage}.`;
            }
            return `${label}\nStatus: ${body?.status || 'unknown'}${uptime}${usage}.`;
        }

        if (action.intent === 'network') {
            const body = result.body as { interfaces?: Array<{ name: string; ipAddresses: string[]; macAddress: string }> } | undefined;
            const interfaces = body?.interfaces || [];
            if (interfaces.length === 0) {
                if (this._isChineseResponse(language)) {
                    return `${label}\n後端沒有回傳網路介面資訊。`;
                }
                if (this._isJapaneseResponse(language)) {
                    return `${label}\nネットワークインターフェース情報は返されませんでした。`;
                }
                if (this._isKoreanResponse(language)) {
                    return `${label}\n네트워크 인터페이스 정보가 반환되지 않았습니다.`;
                }
                return `${label}\nNo network interface details were returned.`;
            }
            const noIp = this._isChineseResponse(language)
                ? '無 IP'
                : this._isJapaneseResponse(language)
                    ? 'IP なし'
                    : this._isKoreanResponse(language)
                        ? 'IP 없음'
                        : 'no IP';
            const rows = interfaces.map((item) => `- ${item.name}: ${item.ipAddresses.join(', ') || noIp} (${item.macAddress})`).join('\n');
            if (this._isChineseResponse(language)) {
                return `${label}\n網路介面：\n${rows}`;
            }
            if (this._isJapaneseResponse(language)) {
                return `${label}\nネットワークインターフェース:\n${rows}`;
            }
            if (this._isKoreanResponse(language)) {
                return `${label}\n네트워크 인터페이스:\n${rows}`;
            }
            return `${label}\nNetwork interfaces:\n${rows}`;
        }

        const upid = (result.body as { upid?: string; task_id?: string } | undefined)?.upid;
        const taskId = (result.body as { upid?: string; task_id?: string } | undefined)?.task_id;
        const tracking = upid ? `\nUPID: ${upid}` : taskId ? `\nTask: ${taskId}` : '';
        if (this._isChineseResponse(language)) {
            return `已對 ${label} 執行 ${action.intent}。\n\n後端回應：${result.message}${tracking}`;
        }
        if (this._isJapaneseResponse(language)) {
            return `${label} に対して ${action.intent} を実行しました。\n\nバックエンド応答: ${result.message}${tracking}`;
        }
        if (this._isKoreanResponse(language)) {
            return `${label}에 대해 ${action.intent}을 실행했습니다.\n\n백엔드 응답: ${result.message}${tracking}`;
        }
        return `Executed ${action.intent} for ${label}.\n\nBackend response: ${result.message}${tracking}`;
    }

    private _formatVMInventory(inventory: AIVMInventoryItem[], language: AIResponseLanguage): string {
        if (inventory.length === 0) {
            if (this._isChineseResponse(language)) {
                return "平台資料庫目前沒有註冊 VM。";
            }
            if (this._isJapaneseResponse(language)) {
                return "プラットフォームデータベースに登録済みの VM はありません。";
            }
            if (this._isKoreanResponse(language)) {
                return "플랫폼 데이터베이스에 등록된 VM이 없습니다.";
            }
            return "No VMs are registered in the platform database.";
        }

        const rows = inventory.slice(0, 50).map((vm) => `- ${this._formatVMLabel(vm)}: ${vm.status}`).join('\n');
        if (this._isChineseResponse(language)) {
            const suffix = inventory.length > 50 ? `\n...另有 ${inventory.length - 50} 台 VM。` : '';
            return `VM 清單（共 ${inventory.length} 台）：\n${rows}${suffix}`;
        }
        if (this._isJapaneseResponse(language)) {
            const suffix = inventory.length > 50 ? `\n...ほかに ${inventory.length - 50} 台の VM があります。` : '';
            return `VM 一覧（合計 ${inventory.length} 台）：\n${rows}${suffix}`;
        }
        if (this._isKoreanResponse(language)) {
            const suffix = inventory.length > 50 ? `\n...그 외 ${inventory.length - 50}개의 VM이 더 있습니다.` : '';
            return `VM 목록(총 ${inventory.length}개):\n${rows}${suffix}`;
        }
        const suffix = inventory.length > 50 ? `\n...and ${inventory.length - 50} more VMs.` : '';
        return `VM inventory (${inventory.length} total):\n${rows}${suffix}`;
    }

    private _formatActionSummary(action: AIVMAction, vm: AIVMInventoryItem, language: AIResponseLanguage): string {
        if (this._isChineseResponse(language)) {
            return `操作：${action.intent}\n目標：${this._formatVMLabel(vm)}\n目前狀態：${vm.status}`;
        }
        if (this._isJapaneseResponse(language)) {
            return `操作: ${action.intent}\n対象: ${this._formatVMLabel(vm)}\n現在の状態: ${vm.status}`;
        }
        if (this._isKoreanResponse(language)) {
            return `작업: ${action.intent}\n대상: ${this._formatVMLabel(vm)}\n현재 상태: ${vm.status}`;
        }
        return `Action: ${action.intent}\nTarget: ${this._formatVMLabel(vm)}\nCurrent status: ${vm.status}`;
    }

    private _formatVMLabel(vm: AIVMInventoryItem): string {
        return `${vm.name} [db:${vm.vm_id}, pve:${vm.pve_vmid}@${vm.pve_node}, owner:${vm.owner}]`;
    }

    private _formatUptime(seconds: number): string {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hours}h ${minutes}m ${secs}s`;
    }

    private _formatVMConfirmation(actionSummary: string, language: AIResponseLanguage): string {
        if (this._isChineseResponse(language)) {
            return `已找到目標 VM，並準備好以下操作。\n\n${actionSummary}\n\n這會改變 VM 狀態。請確認內容後按 Execute 執行。`;
        }
        if (this._isJapaneseResponse(language)) {
            return `対象 VM を特定し、次の操作を準備しました。\n\n${actionSummary}\n\nこの操作は VM の状態を変更します。内容を確認してから Execute を押してください。`;
        }
        if (this._isKoreanResponse(language)) {
            return `대상 VM을 찾았고 다음 작업을 준비했습니다.\n\n${actionSummary}\n\n이 작업은 VM 상태를 변경합니다. 내용을 확인한 뒤 Execute를 눌러 실행하세요.`;
        }
        return `I found the target VM and prepared this action.\n\n${actionSummary}\n\nThis changes VM state. Review it and press Execute to run it.`;
    }

    private _vmMultipleTargetsMessage(options: string, language: AIResponseLanguage): string {
        if (this._isChineseResponse(language)) {
            return `找到多個符合的 VM。請指定一個精確目標。\n${options}`;
        }
        if (this._isJapaneseResponse(language)) {
            return `一致する VM が複数見つかりました。正確な対象を 1 つ指定してください。\n${options}`;
        }
        if (this._isKoreanResponse(language)) {
            return `일치하는 VM을 여러 개 찾았습니다. 정확한 대상 하나를 지정해 주세요.\n${options}`;
        }
        return `I found multiple matching VMs. Please specify one exact target.\n${options}`;
    }

    private _vmTargetNotFoundMessage(language: AIResponseLanguage): string {
        if (this._isChineseResponse(language)) {
            return "無法辨識目標 VM。請指定 VM 名稱、資料庫 id 或 PVE vmid。";
        }
        if (this._isJapaneseResponse(language)) {
            return "対象 VM を特定できませんでした。VM 名、データベース id、または PVE vmid を指定してください。";
        }
        if (this._isKoreanResponse(language)) {
            return "대상 VM을 식별할 수 없습니다. VM 이름, 데이터베이스 id 또는 PVE vmid를 지정해 주세요.";
        }
        return "I could not identify the target VM. Please specify a VM name, database id, or PVE vmid.";
    }

    private _buildVMHelpResponse(language: AIResponseLanguage, reason?: string): string {
        const localizedReason = this._localizeVMReason(reason, language);
        const prefix = localizedReason ? `${localizedReason}\n\n` : '';
        if (this._isChineseResponse(language)) {
            return `${prefix}我可以協助 admin 管理自己擁有的 VM，也可以協助 superadmin 管理所有 VM，例如：\n- 列出可管理的 VM\n- 查詢 VM 123 的狀態\n- 查詢 VM web-lab 的網路資訊\n- 啟動 VM 101\n- 關機 VM web-lab\n- 重新啟動 VM 102\n- 強制關閉 VM 103\n- 刪除 VM 104\n\n建立或建置機器請使用 AI Build 工作區，因為該流程需要 design、implementation 與 validation artifacts。`;
        }
        if (this._isJapaneseResponse(language)) {
            return `${prefix}admin は所有 VM、superadmin は全 VM の管理を支援できます。例：\n- 管理可能な VM を一覧表示\n- VM 123 の状態を表示\n- VM web-lab のネットワーク情報を取得\n- VM 101 を起動\n- VM web-lab をシャットダウン\n- VM 102 を再起動\n- VM 103 を強制停止\n- VM 104 を削除\n\nマシンの作成や構築は AI Build ワークスペースを使用してください。このワークフローでは design、implementation、validation artifacts が必要です。`;
        }
        if (this._isKoreanResponse(language)) {
            return `${prefix}admin은 본인이 소유한 VM을, superadmin은 모든 VM을 관리할 수 있도록 도울 수 있습니다. 예:\n- 관리 가능한 VM 나열\n- VM 123 상태 조회\n- VM web-lab 네트워크 정보 조회\n- VM 101 부팅\n- VM web-lab 종료\n- VM 102 재부팅\n- VM 103 강제 전원 끄기\n- VM 104 삭제\n\n머신 생성/빌드 작업은 design, implementation, validation artifacts가 필요하므로 AI Build 작업 공간을 사용하세요.`;
        }
        return `${prefix}I can help admins manage VMs they own and help superadmins manage all VMs with commands like:\n- list manageable VMs\n- show status for VM 123\n- get network info for VM web-lab\n- boot VM 101\n- shutdown VM web-lab\n- reboot VM 102\n- force poweroff VM 103\n- delete VM 104\n\nCreation/build workflows should use the AI Build workspace, because they require design, implementation, and validation artifacts.`;
    }

    private _localizeVMReason(reason: string | undefined, language: AIResponseLanguage): string {
        if (!reason) {
            return '';
        }

        if (!this._isChineseResponse(language)) {
            if (this._isJapaneseResponse(language)) {
                if (/no supported vm operation|unsupported vm operation|create\/build|ai build/i.test(reason)) {
                    return "対応している VM 操作を判定できませんでした。マシンの作成や構築は AI Build ワークスペースを使用してください。";
                }
                if (/target VM is not clear|not clear|exact VM/i.test(reason)) {
                    return "対象 VM が明確ではありません。正確な VM 名、データベース id、または PVE vmid を指定してください。";
                }
            }
            if (this._isKoreanResponse(language)) {
                if (/no supported vm operation|unsupported vm operation|create\/build|ai build/i.test(reason)) {
                    return "지원되는 VM 작업을 식별하지 못했습니다. 머신 생성/빌드는 AI Build 작업 공간을 사용하세요.";
                }
                if (/target VM is not clear|not clear|exact VM/i.test(reason)) {
                    return "대상 VM이 명확하지 않습니다. 정확한 VM 이름, 데이터베이스 id 또는 PVE vmid를 지정해 주세요.";
                }
            }
            return reason;
        }

        if (/no supported vm operation|unsupported vm operation|create\/build|ai build/i.test(reason)) {
            return "我沒有辨識出可支援的 VM 操作；如果要建立或建置機器，請使用 AI Build 工作區。";
        }

        if (/target VM is not clear|not clear|exact VM/i.test(reason)) {
            return "目標 VM 不夠明確，請提供精確的 VM 名稱、資料庫 id 或 PVE vmid。";
        }

        return reason;
    }

    private _includesAny(text: string, needles: string[]): boolean {
        return needles.some((needle) => text.includes(needle));
    }

}
