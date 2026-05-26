import { resp } from "../../utils/resp";
import {
    AIResponseLanguage,
    isChineseResponse,
    isJapaneseResponse,
    isKoreanResponse
} from "./AIChatLanguagePolicy";
import { AIVMManagementAction } from "./AIChatVMIntentPolicy";

export interface AIChatVMInventoryItem {
    vm_id: string;
    pve_vmid: string;
    pve_node: string;
    name: string;
    owner_id: string;
    owner: string;
    status: string;
    uptime?: number;
}

export function resolveAIChatVMTarget(
    action: AIVMManagementAction,
    inventory: AIChatVMInventoryItem[],
    currentVmId?: string,
    language: AIResponseLanguage = "en"
): { vm?: AIChatVMInventoryItem; error?: string } {
    if (action.vm_id) {
        const byId = inventory.find((vm) => vm.vm_id === action.vm_id);
        if (byId) return { vm: byId };
    }

    if (!action.target_pve_vmid && !action.target_name && !action.target_selector && currentVmId) {
        const current = inventory.find((vm) => vm.vm_id === currentVmId);
        if (current) return { vm: current };
    }

    const candidates = new Set<AIChatVMInventoryItem>();
    const addMatches = (
        value: string | undefined,
        matcher: (vm: AIChatVMInventoryItem, value: string) => boolean
    ) => {
        if (!value) return;
        const normalizedValue = value.trim().toLowerCase();
        if (!normalizedValue) return;
        inventory.filter((vm) => matcher(vm, normalizedValue)).forEach((vm) => candidates.add(vm));
    };

    addMatches(action.target_pve_vmid, (vm, value) => vm.pve_vmid.toLowerCase() === value);
    addMatches(action.target_name, (vm, value) => vm.name.toLowerCase() === value);
    addMatches(action.target_selector, (vm, value) => {
        const pvePattern = new RegExp(`(^|[^0-9])${vm.pve_vmid}([^0-9]|$)`);
        const compactValue = value.replace(/[^a-z0-9]/g, "");
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

    if (candidates.size === 1) return { vm: Array.from(candidates)[0] };

    if (candidates.size > 1) {
        const options = Array.from(candidates)
            .slice(0, 8)
            .map((vm) => `- ${formatAIChatVMLabel(vm)}`)
            .join("\n");
        return { error: multipleTargetsMessage(options, language) };
    }

    return { error: buildAIChatVMTargetNotFoundMessage(language) };
}

export function formatAIChatVMActionResult(
    action: AIVMManagementAction,
    vm: AIChatVMInventoryItem,
    result: resp<unknown>,
    language: AIResponseLanguage
): string {
    const label = formatAIChatVMLabel(vm);
    if (result.code !== 200) {
        if (isChineseResponse(language)) {
            return `對 ${label} 執行 ${action.intent} 失敗。\n\n後端回應：${result.code} ${result.message}`;
        }
        if (isJapaneseResponse(language)) {
            return `${label} に対する ${action.intent} の実行に失敗しました。\n\nバックエンド応答: ${result.code} ${result.message}`;
        }
        if (isKoreanResponse(language)) {
            return `${label}에 대해 ${action.intent} 실행에 실패했습니다.\n\n백엔드 응답: ${result.code} ${result.message}`;
        }
        return `Failed to ${action.intent} ${label}.\n\nBackend response: ${result.code} ${result.message}`;
    }

    if (action.intent === "status") {
        const body = result.body as { status?: string; uptime?: number; resourceUsage?: { cpu?: number; memory?: number } } | undefined;
        const uptime = body?.uptime !== undefined ? `, uptime ${formatAIChatVMUptime(body.uptime)}` : "";
        const usage = body?.resourceUsage ? `, CPU ${body.resourceUsage.cpu ?? 0}%, memory ${body.resourceUsage.memory ?? 0}GB` : "";
        if (isChineseResponse(language)) {
            const zhUptime = body?.uptime !== undefined ? `，運行時間 ${formatAIChatVMUptime(body.uptime)}` : "";
            const zhUsage = body?.resourceUsage ? `，CPU ${body.resourceUsage.cpu ?? 0}%，記憶體 ${body.resourceUsage.memory ?? 0}GB` : "";
            return `${label}\n狀態：${body?.status || "unknown"}${zhUptime}${zhUsage}。`;
        }
        if (isJapaneseResponse(language)) {
            const jaUptime = body?.uptime !== undefined ? `、稼働時間 ${formatAIChatVMUptime(body.uptime)}` : "";
            const jaUsage = body?.resourceUsage ? `、CPU ${body.resourceUsage.cpu ?? 0}%、メモリ ${body.resourceUsage.memory ?? 0}GB` : "";
            return `${label}\n状態: ${body?.status || "unknown"}${jaUptime}${jaUsage}。`;
        }
        if (isKoreanResponse(language)) {
            const koUptime = body?.uptime !== undefined ? `, 가동 시간 ${formatAIChatVMUptime(body.uptime)}` : "";
            const koUsage = body?.resourceUsage ? `, CPU ${body.resourceUsage.cpu ?? 0}%, 메모리 ${body.resourceUsage.memory ?? 0}GB` : "";
            return `${label}\n상태: ${body?.status || "unknown"}${koUptime}${koUsage}.`;
        }
        return `${label}\nStatus: ${body?.status || "unknown"}${uptime}${usage}.`;
    }

    if (action.intent === "network") {
        const body = result.body as { interfaces?: Array<{ name: string; ipAddresses: string[]; macAddress: string }> } | undefined;
        const interfaces = body?.interfaces || [];
        if (interfaces.length === 0) {
            if (isChineseResponse(language)) return `${label}\n後端沒有回傳網路介面資訊。`;
            if (isJapaneseResponse(language)) return `${label}\nネットワークインターフェース情報は返されませんでした。`;
            if (isKoreanResponse(language)) return `${label}\n네트워크 인터페이스 정보가 반환되지 않았습니다.`;
            return `${label}\nNo network interface details were returned.`;
        }
        const noIp = isChineseResponse(language)
            ? "無 IP"
            : isJapaneseResponse(language)
                ? "IP なし"
                : isKoreanResponse(language)
                    ? "IP 없음"
                    : "no IP";
        const rows = interfaces.map((item) => `- ${item.name}: ${item.ipAddresses.join(", ") || noIp} (${item.macAddress})`).join("\n");
        if (isChineseResponse(language)) return `${label}\n網路介面：\n${rows}`;
        if (isJapaneseResponse(language)) return `${label}\nネットワークインターフェース:\n${rows}`;
        if (isKoreanResponse(language)) return `${label}\n네트워크 인터페이스:\n${rows}`;
        return `${label}\nNetwork interfaces:\n${rows}`;
    }

    const upid = (result.body as { upid?: string; task_id?: string } | undefined)?.upid;
    const taskId = (result.body as { upid?: string; task_id?: string } | undefined)?.task_id;
    const tracking = upid ? `\nUPID: ${upid}` : taskId ? `\nTask: ${taskId}` : "";
    if (isChineseResponse(language)) return `已對 ${label} 執行 ${action.intent}。\n\n後端回應：${result.message}${tracking}`;
    if (isJapaneseResponse(language)) return `${label} に対して ${action.intent} を実行しました。\n\nバックエンド応答: ${result.message}${tracking}`;
    if (isKoreanResponse(language)) return `${label}에 대해 ${action.intent}을 실행했습니다.\n\n백엔드 응답: ${result.message}${tracking}`;
    return `Executed ${action.intent} for ${label}.\n\nBackend response: ${result.message}${tracking}`;
}

export function formatAIChatVMInventory(inventory: AIChatVMInventoryItem[], language: AIResponseLanguage): string {
    if (inventory.length === 0) {
        if (isChineseResponse(language)) return "平台資料庫目前沒有註冊 VM。";
        if (isJapaneseResponse(language)) return "プラットフォームデータベースに登録済みの VM はありません。";
        if (isKoreanResponse(language)) return "플랫폼 데이터베이스에 등록된 VM이 없습니다.";
        return "No VMs are registered in the platform database.";
    }

    const rows = inventory.slice(0, 50).map((vm) => `- ${formatAIChatVMLabel(vm)}: ${vm.status}`).join("\n");
    if (isChineseResponse(language)) {
        const suffix = inventory.length > 50 ? `\n...另有 ${inventory.length - 50} 台 VM。` : "";
        return `VM 清單（共 ${inventory.length} 台）：\n${rows}${suffix}`;
    }
    if (isJapaneseResponse(language)) {
        const suffix = inventory.length > 50 ? `\n...ほかに ${inventory.length - 50} 台の VM があります。` : "";
        return `VM 一覧（合計 ${inventory.length} 台）：\n${rows}${suffix}`;
    }
    if (isKoreanResponse(language)) {
        const suffix = inventory.length > 50 ? `\n...그 외 ${inventory.length - 50}개의 VM이 더 있습니다.` : "";
        return `VM 목록(총 ${inventory.length}개):\n${rows}${suffix}`;
    }
    const suffix = inventory.length > 50 ? `\n...and ${inventory.length - 50} more VMs.` : "";
    return `VM inventory (${inventory.length} total):\n${rows}${suffix}`;
}

export function formatAIChatVMActionSummary(
    action: AIVMManagementAction,
    vm: AIChatVMInventoryItem,
    language: AIResponseLanguage
): string {
    if (isChineseResponse(language)) return `操作：${action.intent}\n目標：${formatAIChatVMLabel(vm)}\n目前狀態：${vm.status}`;
    if (isJapaneseResponse(language)) return `操作: ${action.intent}\n対象: ${formatAIChatVMLabel(vm)}\n現在の状態: ${vm.status}`;
    if (isKoreanResponse(language)) return `작업: ${action.intent}\n대상: ${formatAIChatVMLabel(vm)}\n현재 상태: ${vm.status}`;
    return `Action: ${action.intent}\nTarget: ${formatAIChatVMLabel(vm)}\nCurrent status: ${vm.status}`;
}

export function formatAIChatVMConfirmation(actionSummary: string, language: AIResponseLanguage): string {
    if (isChineseResponse(language)) {
        return `已找到目標 VM，並準備好以下操作。\n\n${actionSummary}\n\n這會改變 VM 狀態。請確認內容後按 Execute 執行。`;
    }
    if (isJapaneseResponse(language)) {
        return `対象 VM を特定し、次の操作を準備しました。\n\n${actionSummary}\n\nこの操作は VM の状態を変更します。内容を確認してから Execute を押してください。`;
    }
    if (isKoreanResponse(language)) {
        return `대상 VM을 찾았고 다음 작업을 준비했습니다.\n\n${actionSummary}\n\n이 작업은 VM 상태를 변경합니다. 내용을 확인한 뒤 Execute를 눌러 실행하세요.`;
    }
    return `I found the target VM and prepared this action.\n\n${actionSummary}\n\nThis changes VM state. Review it and press Execute to run it.`;
}

export function buildAIChatVMHelpResponse(language: AIResponseLanguage, reason?: string): string {
    const localizedReason = localizeVMReason(reason, language);
    const prefix = localizedReason ? `${localizedReason}\n\n` : "";
    if (isChineseResponse(language)) {
        return `${prefix}我可以協助 admin 管理自己擁有的 VM，也可以協助 superadmin 管理所有 VM，例如：\n- 列出可管理的 VM\n- 查詢 VM 123 的狀態\n- 查詢 VM web-lab 的網路資訊\n- 啟動 VM 101\n- 關機 VM web-lab\n- 重新啟動 VM 102\n- 強制關閉 VM 103\n- 刪除 VM 104\n\n建立或建置機器請使用 AI Build 工作區，因為該流程需要 design、implementation 與 validation artifacts。`;
    }
    if (isJapaneseResponse(language)) {
        return `${prefix}admin は所有 VM、superadmin は全 VM の管理を支援できます。例：\n- 管理可能な VM を一覧表示\n- VM 123 の状態を表示\n- VM web-lab のネットワーク情報を取得\n- VM 101 を起動\n- VM web-lab をシャットダウン\n- VM 102 を再起動\n- VM 103 を強制停止\n- VM 104 を削除\n\nマシンの作成や構築は AI Build ワークスペースを使用してください。このワークフローでは design、implementation、validation artifacts が必要です。`;
    }
    if (isKoreanResponse(language)) {
        return `${prefix}admin은 본인이 소유한 VM을, superadmin은 모든 VM을 관리할 수 있도록 도울 수 있습니다. 예:\n- 관리 가능한 VM 나열\n- VM 123 상태 조회\n- VM web-lab 네트워크 정보 조회\n- VM 101 부팅\n- VM web-lab 종료\n- VM 102 재부팅\n- VM 103 강제 전원 끄기\n- VM 104 삭제\n\n머신 생성/빌드 작업은 design, implementation, validation artifacts가 필요하므로 AI Build 작업 공간을 사용하세요.`;
    }
    return `${prefix}I can help admins manage VMs they own and help superadmins manage all VMs with commands like:\n- list manageable VMs\n- show status for VM 123\n- get network info for VM web-lab\n- boot VM 101\n- shutdown VM web-lab\n- reboot VM 102\n- force poweroff VM 103\n- delete VM 104\n\nCreation/build workflows should use the AI Build workspace, because they require design, implementation, and validation artifacts.`;
}

export function formatAIChatVMLabel(vm: AIChatVMInventoryItem): string {
    return `${vm.name} [db:${vm.vm_id}, pve:${vm.pve_vmid}@${vm.pve_node}, owner:${vm.owner}]`;
}

export function formatAIChatVMUptime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}h ${minutes}m ${secs}s`;
}

function multipleTargetsMessage(options: string, language: AIResponseLanguage): string {
    if (isChineseResponse(language)) return `找到多個符合的 VM。請指定一個精確目標。\n${options}`;
    if (isJapaneseResponse(language)) return `一致する VM が複数見つかりました。正確な対象を 1 つ指定してください。\n${options}`;
    if (isKoreanResponse(language)) return `일치하는 VM을 여러 개 찾았습니다. 정확한 대상 하나를 지정해 주세요.\n${options}`;
    return `I found multiple matching VMs. Please specify one exact target.\n${options}`;
}

export function buildAIChatVMTargetNotFoundMessage(language: AIResponseLanguage): string {
    if (isChineseResponse(language)) return "無法辨識目標 VM。請指定 VM 名稱、資料庫 id 或 PVE vmid。";
    if (isJapaneseResponse(language)) return "対象 VM を特定できませんでした。VM 名、データベース id、または PVE vmid を指定してください。";
    if (isKoreanResponse(language)) return "대상 VM을 식별할 수 없습니다. VM 이름, 데이터베이스 id 또는 PVE vmid를 지정해 주세요.";
    return "I could not identify the target VM. Please specify a VM name, database id, or PVE vmid.";
}

function localizeVMReason(reason: string | undefined, language: AIResponseLanguage): string {
    if (!reason) return "";

    if (!isChineseResponse(language)) {
        if (isJapaneseResponse(language)) {
            if (/no supported vm operation|unsupported vm operation|create\/build|ai build/i.test(reason)) {
                return "対応している VM 操作を判定できませんでした。マシンの作成や構築は AI Build ワークスペースを使用してください。";
            }
            if (/target VM is not clear|not clear|exact VM/i.test(reason)) {
                return "対象 VM が明確ではありません。正確な VM 名、データベース id、または PVE vmid を指定してください。";
            }
        }
        if (isKoreanResponse(language)) {
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
