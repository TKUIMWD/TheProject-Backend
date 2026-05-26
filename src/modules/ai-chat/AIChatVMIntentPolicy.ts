export type AIVMManagementIntent = 'help' | 'list_vms' | 'status' | 'network' | 'boot' | 'shutdown' | 'poweroff' | 'reboot' | 'reset' | 'delete';

export interface AIVMManagementAction {
    intent: AIVMManagementIntent;
    vm_id?: string;
    target_pve_vmid?: string;
    target_name?: string;
    target_selector?: string;
    confidence?: number;
    reason?: string;
}

export interface AIVMClassifierTarget {
    vm_id?: string;
    pve_vmid?: string;
    name?: string;
    selector?: string;
}

export interface AIVMClassifierOutput {
    action?: string;
    intent?: string;
    target?: AIVMClassifierTarget;
    confidence?: number;
    reason?: string;
}

const SUPPORTED_INTENTS: AIVMManagementIntent[] = ['help', 'list_vms', 'status', 'network', 'boot', 'shutdown', 'poweroff', 'reboot', 'reset', 'delete'];

export function normalizeVMIntent(intent: string | undefined): AIVMManagementIntent {
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

    if (SUPPORTED_INTENTS.includes(normalized as AIVMManagementIntent)) {
        return normalized as AIVMManagementIntent;
    }

    return aliases[normalized] || 'help';
}

export function interpretVMManagementFallback(userInput: string, currentVmId?: string): AIVMManagementAction {
    const text = userInput.toLowerCase();
    let intent: AIVMManagementIntent = 'help';

    if (includesAny(text, ['list', 'show all', 'inventory', '\u5217\u51fa', '\u6240\u6709'])) {
        intent = 'list_vms';
    } else if (includesAny(text, ['network', 'ip', '\u7db2\u8def'])) {
        intent = 'network';
    } else if (includesAny(text, ['status', '\u72c0\u614b'])) {
        intent = 'status';
    } else if (includesAny(text, ['reboot', 'restart', '\u91cd\u555f'])) {
        intent = 'reboot';
    } else if (includesAny(text, ['reset', '\u91cd\u7f6e'])) {
        intent = 'reset';
    } else if (includesAny(text, ['delete', 'remove', 'destroy', '\u522a\u9664'])) {
        intent = 'delete';
    } else if (includesAny(text, ['poweroff', 'force stop', 'hard stop', '\u5f37\u5236'])) {
        intent = 'poweroff';
    } else if (includesAny(text, ['shutdown', '\u95dc\u6a5f'])) {
        intent = 'shutdown';
    } else if (includesAny(text, ['boot', 'start', '\u958b\u6a5f', '\u555f\u52d5'])) {
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

function includesAny(text: string, needles: string[]): boolean {
    return needles.some((needle) => text.includes(needle));
}

export function parseVMClassifierOutput(raw: string): AIVMClassifierOutput | null {
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

export function classifierOutputToVMAction(output: AIVMClassifierOutput): AIVMManagementAction {
    const target = output.target || {};
    return {
        intent: normalizeVMIntent(output.action || output.intent),
        vm_id: target.vm_id,
        target_pve_vmid: target.pve_vmid,
        target_name: target.name,
        target_selector: target.selector,
        confidence: output.confidence,
        reason: output.reason
    };
}
