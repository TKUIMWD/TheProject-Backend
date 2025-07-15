import { PVE_qemu_config } from "../interfaces/PVE";

/**
 * PVE 相關的工具函數
 * 這些函數可以在 PVEService、VMService 和 TemplateService 中共享使用
 */
export class PVEUtils {
    
    /**
     * 從 QEMU 配置中提取 CPU 核心數
     */
    static extractCpuCores(qemuConfig: PVE_qemu_config): number {
        return qemuConfig.cores;
    }

    /**
     * 從 QEMU 配置中提取記憶體大小 (MB)
     */
    static extractMemorySize(qemuConfig: PVE_qemu_config): number {
        const memoryStr = qemuConfig.memory;
        const memoryNum = parseInt(memoryStr, 10);
        if (isNaN(memoryNum)) {
            throw new Error(`Invalid memory format: ${memoryStr}`);
        }
        return memoryNum;
    }

    /**
     * 從 QEMU 配置中提取磁碟大小 (GB)
     */
    static extractDiskSize(qemuConfig: PVE_qemu_config): number {
        const scsi0 = qemuConfig.scsi0;
        if (!scsi0) {
            throw new Error("No scsi0 disk configuration found");
        }

        const sizeMatch = scsi0.match(/size=(\d+)G/);
        if (!sizeMatch) {
            throw new Error(`Unable to parse disk size from scsi0: ${scsi0}`);
        }

        return parseInt(sizeMatch[1], 10);
    }

    /**
     * 驗證和清理 VM 名稱以符合 DNS 格式要求
     */
    static sanitizeVMName(name: string): string | null {
        if (!name || typeof name !== 'string') {
            return null;
        }

        // 移除或替換不合法的字符
        let sanitized = name
            .toLowerCase()                    // 轉為小寫
            .replace(/[^a-z0-9.-]/g, '-')    // 替換非字母數字、點、連字符的字符為連字符
            .replace(/^[-.]|[-.]$/g, '')     // 移除開頭和結尾的連字符或點
            .replace(/[-]{2,}/g, '-')        // 將多個連續連字符替換為單個
            .replace(/[.]{2,}/g, '.')        // 將多個連續點替換為單個
            .substring(0, 63);               // DNS 名稱最大長度為 63 字符

        // 確保名稱不為空且符合 DNS 格式
        if (!sanitized || sanitized.length === 0) {
            return null;
        }

        // 確保不以連字符開頭或結尾
        if (sanitized.startsWith('-') || sanitized.endsWith('-')) {
            sanitized = sanitized.replace(/^-+|-+$/g, '');
        }

        // 最終驗證
        const dnsNameRegex = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;
        return dnsNameRegex.test(sanitized) ? sanitized : null;
    }

    /**
     * 從 QEMU 配置中提取磁碟大小 (用於 VM 管理)
     */
    static extractDiskSizeFromConfig(scsi0Config: string | undefined): number | null {
        if (!scsi0Config) return null;
        
        const sizeMatch = scsi0Config.match(/size=(\d+)G/);
        if (sizeMatch) {
            return parseInt(sizeMatch[1]);
        }
        return null;
    }
}
