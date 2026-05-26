import { pve_api } from "../enum/PVE_API";
import { PVEResp } from "../interfaces/Response/PVEResp";
import { resp, createResponse } from "./resp";
import { VMBasicConfig, VMDetailedConfig, NetworkInterface, NetworkInterfacesResponse, NetworkIPAddress, NetworkStatistics } from "../interfaces/VM/VM";
import { PVE_qemu_config, PVE_Task_Status_Response, PVE_TASK_STATUS, PVE_TASK_EXIT_STATUS } from "../interfaces/PVE";
import { logger } from "../middlewares/log";
import { PVEUtils } from "./PVEUtils";
import { PVEClientRequestOptions, PVEHttpMethod, pveClient } from "../modules/pve/PVEClient";

export type GuestAgentCommandResult = {
    success: boolean;
    exitCode?: number;
    stdout?: string;
    stderr?: string;
    errorMessage?: string;
};

function callPVE<T = unknown>(
    method: PVEHttpMethod,
    url: string,
    body?: Record<string, unknown> | FormData,
    options: PVEClientRequestOptions = {}
): Promise<T> {
    return pveClient.request<T>(method, url, body, {
        mode: options.mode,
        headers: options.headers
    });
}

/*
 * - validateVMCreationParams: 驗證VM創建參數
 * - cloneVM: 克隆VM
 * - configureVMCPU: 配置VM CPU核心數
 * - configureVMMemory: 配置VM記憶體
 * - resizeVMDisk: 調整VM磁碟大小
 * - configureCloudInit: 配置Cloud-Init
 * - waitForTaskCompletion: 等待任務完成
 * - getCurrentVMConfig: 獲取VM當前配置
 * - getVMStatus: 獲取VM狀態
 * - getVMNetworkInfo: 獲取VM網路信息
 * - getBasicQemuConfig: 獲取基本QEMU配置
 * - getDetailedQemuConfig: 獲取詳細QEMU配置
 * - getNextVMId: 獲取下一個可用VM ID
 * - getTemplateInfo: 獲取範本資訊
 * - getVMConfig: 獲取VM配置
 * - forceCleanupVMDisks: 強制清理VM磁碟
 * - waitForVMDiskReady: 等待VM磁碟準備就緒
 * - deleteVMWithDiskCleanup: 刪除VM並清理磁碟
 * - deleteTemplate: 刪除模板
 * - regenerateCloudInit: 重新生成Cloud-Init
 * - startVM: 啟動VM
 * - shutdownVM: 正常關機VM
 * - stopVM: 強制停止VM
 * - rebootVM: 重啟VM
 * - resetVM: 重置VM
 */


export class VMUtils {
    
    /**
     * 獲取 VM 的基本配置資訊
     */
    static async getBasicQemuConfig(node: string, vmid: string): Promise<resp<VMBasicConfig | undefined>> {
        try {
            const qemuResp: PVEResp = await callPVE('GET', pve_api.nodes_qemu_config(node, vmid), undefined);

            if (qemuResp && qemuResp.data) {
                const config: VMBasicConfig = {
                    vmid: parseInt(vmid),
                    name: qemuResp.data.name,
                    cores: qemuResp.data.cores,
                    memory: qemuResp.data.memory,
                    node: node,
                    status: qemuResp.data.status || 'unknown',
                    disk_size: PVEUtils.extractDiskSizeFromConfig(qemuResp.data.scsi0)
                };
                return createResponse(200, "Basic VM config fetched successfully", config);
            } else {
                return createResponse(404, "VM config not found or invalid response");
            }
        } catch (error) {
            logger.error("Error in getBasicQemuConfig:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * 獲取 VM 的詳細配置資訊
     */
    static async getDetailedQemuConfig(node: string, vmid: string): Promise<resp<VMDetailedConfig | undefined>> {
        try {
            const qemuResp: PVEResp = await callPVE('GET', pve_api.nodes_qemu_config(node, vmid), undefined);

            if (qemuResp && qemuResp.data) {
                const config: VMDetailedConfig = {
                    vmid: parseInt(vmid),
                    name: qemuResp.data.name,
                    cores: qemuResp.data.cores,
                    memory: qemuResp.data.memory,
                    node: node,
                    status: qemuResp.data.status || 'unknown',
                    scsi0: qemuResp.data.scsi0,
                    net0: qemuResp.data.net0,
                    bootdisk: qemuResp.data.bootdisk,
                    ostype: qemuResp.data.ostype,
                    disk_size: PVEUtils.extractDiskSizeFromConfig(qemuResp.data.scsi0)
                };
                return createResponse(200, "Detailed VM config fetched successfully", config);
            } else {
                return createResponse(404, "VM config not found or invalid response");
            }
        } catch (error) {
            logger.error("Error in getDetailedQemuConfig:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * 獲取下一個可用的 VM ID
     */
    static async getNextVMId(): Promise<resp<PVEResp | undefined>> {
        try {
            const nextId: PVEResp = await callPVE('GET', pve_api.cluster_next_id, undefined, { mode: 'user' });
            return createResponse(200, "Next ID fetched successfully", nextId);
        } catch (error) {
            logger.error("Error in getNextVMId:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * 獲取範本資訊
     */
    static async getTemplateInfo(node: string, vmid: string): Promise<resp<PVE_qemu_config | undefined>> {
        try {
            const qemuResp: PVEResp = await callPVE('GET', pve_api.nodes_qemu_config(node, vmid), undefined);

            if (qemuResp && qemuResp.data) {
                return createResponse(200, "Template info fetched successfully", qemuResp.data);
            } else {
                return createResponse(404, "Template not found or invalid response");
            }
        } catch (error) {
            logger.error("Error in getTemplateInfo:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * 獲取 VM 配置（用於磁碟清理）
     */
    static async getVMConfig(pve_node: string, pve_vmid: string): Promise<any> {
        try {
            const configResp: any = await callPVE('GET', pve_api.nodes_qemu_config(pve_node, pve_vmid), undefined);
            
            return configResp?.data || null;
        } catch (error) {
            logger.error(`Failed to get VM ${pve_vmid} config:`, error);
            return null;
        }
    }

    /**
     * 強制清理 VM 磁碟
     */
    static async forceCleanupVMDisks(pve_node: string, pve_vmid: string): Promise<void> {
        try {
            // 獲取 VM 的配置以查找磁碟
            const vmConfig = await this.getVMConfig(pve_node, pve_vmid);
            if (!vmConfig) {
                logger.warn(`Cannot get VM ${pve_vmid} config for disk cleanup`);
                return;
            }

            // 查找所有磁碟配置
            const diskConfigs: string[] = [];
            Object.keys(vmConfig).forEach(key => {
                if (key.startsWith('scsi') || key.startsWith('ide') || key.startsWith('sata') || key.startsWith('virtio')) {
                    const diskConfig = vmConfig[key];
                    if (typeof diskConfig === 'string' && diskConfig.includes(':')) {
                        diskConfigs.push(diskConfig);
                    }
                }
            });

            // 嘗試刪除每個磁碟
            for (const diskConfig of diskConfigs) {
                try {
                    // 解析磁碟配置，格式通常是 "storage:vmid/vm-vmid-disk-N.qcow2"
                    const parts = diskConfig.split(':');
                    if (parts.length >= 2) {
                        const storage = parts[0];
                        const volumeId = parts[1].split(',')[0]; // 移除其他參數
                        
                        // 嘗試刪除磁碟
                        await callPVE('DELETE', pve_api.nodes_storage_content(pve_node, storage, `${storage}:${volumeId}`), undefined);
                        logger.info(`Successfully deleted disk ${storage}:${volumeId} from VM ${pve_vmid}`);
                    }
                } catch (diskError) {
                    logger.warn(`Failed to delete disk ${diskConfig} from VM ${pve_vmid}:`, diskError);
                }
            }
        } catch (error) {
            logger.error(`Error during force disk cleanup for VM ${pve_vmid}:`, error);
        }
    }

    /**
     * 等待 VM 磁碟就緒
     */
    static async waitForVMDiskReady(target_node: string, vmid: string, maxRetries: number = 10): Promise<{ success: boolean, errorMessage?: string }> {
        try {
            logger.info(`Waiting for VM ${vmid} disk to be ready...`);
            
            let retries = 0;
            while (retries < maxRetries) {
                try {
                    const configResp: any = await callPVE('GET', pve_api.nodes_qemu_config(target_node, vmid), undefined);
                    
                    if (configResp && configResp.data && configResp.data.scsi0) {
                        logger.info(`VM ${vmid} disk is ready`);
                        return { success: true };
                    }
                    
                    logger.debug(`VM ${vmid} disk not ready yet, retrying in 3 seconds... (${retries + 1}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    retries++;
                } catch (error) {
                    logger.warn(`Error checking VM ${vmid} disk status, retrying... (${retries + 1}/${maxRetries}):`, error);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    retries++;
                }
            }
            
            return { success: false, errorMessage: `VM ${vmid} disk not ready after ${maxRetries} retries` };
        } catch (error) {
            logger.error(`Error waiting for VM ${vmid} disk to be ready:`, error);
            return { success: false, errorMessage: `Error waiting for VM ${vmid} disk to be ready` };
        }
    }

    /**
     * 刪除 VM 並清理磁碟
     */
    static async deleteVMWithDiskCleanup(pve_node: string, pve_vmid: string): Promise<{ success: boolean, upid?: string, errorMessage?: string }> {
        try {
            // 添加磁碟清理參數
            const deleteParams = {
                purge: 1,
                'destroy-unreferenced-disks': 1
            };
            
            const deleteResp: PVEResp = await callPVE('DELETE', pve_api.nodes_qemu_vm(pve_node, pve_vmid), deleteParams);

            if (deleteResp && deleteResp.data) {
                logger.info(`Successfully deleted VM ${pve_vmid} from PVE node ${pve_node} with disk cleanup`);
                return { success: true, upid: deleteResp.data };
            } else {
                logger.info(`VM ${pve_vmid} deleted successfully (immediate completion)`);
                return { success: true };
            }
        } catch (error) {
            logger.error(`Failed to delete VM ${pve_vmid} from PVE:`, error);
            
            // 如果 VM 刪除失敗，嘗試手動清理磁碟
            try {
                await this.forceCleanupVMDisks(pve_node, pve_vmid);
            } catch (diskCleanupError) {
                logger.error(`Failed to force cleanup disks for VM ${pve_vmid}:`, diskCleanupError);
            }
            
            return { success: false, errorMessage: `Failed to delete VM ${pve_vmid}` };
        }
    }

    /**
     * 等待 PVE 任務完成
     */
    static async waitForPVETaskCompletion(node: string, upid: string, operationType: string): Promise<{ success: boolean, errorMessage?: string }> {
        try {
            logger.info(`Waiting for ${operationType} completion with UPID ${upid} on node ${node}`);
            
            const maxRetries = 120; // 最多等待 600 秒 (120 * 5 秒)
            let retries = 0;
            
            while (retries < maxRetries) {
                try {
                    const statusResp: any = await callPVE('GET', pve_api.nodes_tasks_status(node, upid), undefined);
                    
                    if (statusResp && statusResp.data) {
                        const { status, exitstatus } = statusResp.data;
                        
                        if (status === 'stopped') {
                            if (exitstatus === 'OK') {
                                logger.info(`${operationType} task ${upid} completed successfully`);
                                return { success: true };
                            } else {
                                logger.warn(`${operationType} task ${upid} failed with exit status: ${exitstatus}`);
                                return { success: false, errorMessage: `Task failed with exit status: ${exitstatus}` };
                            }
                        } else if (status === 'running') {
                            logger.debug(`${operationType} task ${upid} is still running...`);
                        }
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    retries++;
                } catch (error) {
                    logger.warn(`Error checking ${operationType} task status, retrying... (${retries + 1}/${maxRetries}):`, error);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    retries++;
                }
            }
            
            return { success: false, errorMessage: `${operationType} task ${upid} did not complete within timeout` };
        } catch (error) {
            logger.error(`Error waiting for ${operationType} task completion:`, error);
            return { success: false, errorMessage: `Error waiting for ${operationType} task completion` };
        }
    }

    /**
     * 驗證 VM 創建參數
     */
    static async validateVMCreationParams(params: {
        template_id: string,
        name: string,
        target: string,
        cpuCores: number,
        memorySize: number,
        diskSize: number,
        ciuser?: string,
        cipassword?: string
    }): Promise<resp<string | undefined>> {
        const { template_id, name, target, cpuCores, memorySize, diskSize, ciuser, cipassword } = params;

        const missingFields = [];
        if (!template_id) missingFields.push("template_id");
        if (!name) missingFields.push("name");
        if (!target) missingFields.push("target");
        if (!cpuCores) missingFields.push("cpuCores");
        if (!memorySize) missingFields.push("memorySize");
        if (!diskSize) missingFields.push("diskSize");

        if (missingFields.length > 0) {
            return createResponse(400, `Missing required fields: ${missingFields.join(", ")}`);
        }

        // 檢查 ci user 和 ci password 是否同時存在（如果提供的話）
        if ((ciuser && !cipassword) || (!ciuser && cipassword)) {
            return createResponse(400, "Both ciuser and cipassword must be provided together if specified");
        }

        return createResponse(200, "Validation passed");
    }

    /**
     * 克隆 VM
     */
    static async cloneVM(sourceNode: string, sourceVmid: string, newVmid: string, vmName: string, targetNode: string, storage: string, full: string): Promise<{ success: boolean, upid?: string, errorMessage?: string }> {
        try {
            logger.info(`Cloning template ${sourceVmid} from node ${sourceNode} to ${targetNode} with new ID ${newVmid}`);

            // 克隆任務在源節點上執行，通過 target 參數指定目標節點
            const cloneResp: PVEResp = await callPVE('POST', pve_api.nodes_qemu_clone(sourceNode, sourceVmid), {
                newid: newVmid,
                name: vmName,
                target: targetNode,  // 指定目標節點
                storage: storage,
                full: full,
            });

            logger.debug(`Clone API response received for VM ${newVmid}: dataType=${typeof cloneResp?.data}, hasErrors=${Boolean(cloneResp?.errors)}`);

            // 檢查響應是否成功
            if (!cloneResp) {
                return { success: false, errorMessage: "No response from PVE API" };
            }

            // 檢查是否有錯誤
            if (cloneResp.errors) {
                const errorMessages = Object.values(cloneResp.errors).join(', ');
                return { success: false, errorMessage: `PVE API errors: ${errorMessages}` };
            }

            // 檢查 data 字段中是否有 UPID
            if (cloneResp.data) {
                if (typeof cloneResp.data === 'string') {
                    // UPID 是字符串格式
                    logger.info(`Clone operation initiated for VM ${newVmid} with UPID: ${cloneResp.data}`);
                    return { success: true, upid: cloneResp.data };
                } else if (typeof cloneResp.data === 'object' && cloneResp.data.upid) {
                    // UPID 在對象中
                    logger.info(`Clone operation initiated for VM ${newVmid} with UPID: ${cloneResp.data.upid}`);
                    return { success: true, upid: cloneResp.data.upid };
                }
            }

            // 檢查頂級是否直接包含 UPID（某些 PVE 版本的響應格式）
            if (typeof cloneResp === 'string') {
                logger.info(`Clone operation initiated for VM ${newVmid} with UPID: ${cloneResp}`);
                return { success: true, upid: cloneResp };
            }

            // 檢查是否有 success 標誌但沒有 UPID（可能是同步操作）
            if (cloneResp.success === 1 || cloneResp.success === true) {
                logger.info(`Clone operation completed successfully for VM ${newVmid} (no UPID - synchronous operation)`);
                return { success: true };
            }

            // 如果沒有明確的錯誤，但也沒有成功標誌或 UPID，則假設操作可能成功但需要驗證
            logger.warn(`Clone operation for VM ${newVmid} completed with unclear status - will attempt verification`);
            return { success: true };

        } catch (error) {
            logger.error(`Error during VM clone operation:`, error);
            return { success: false, errorMessage: error instanceof Error ? error.message : "Unknown error during clone" };
        }
    }

    /**
     * 配置 VM CPU 核心數
     */
    static async configureVMCPU(node: string, vmid: string, cpuCores: number): Promise<{ success: boolean, upid?: string, errorMessage?: string }> {
        try {
            const configResp: PVEResp = await callPVE('PUT', pve_api.nodes_qemu_config(node, vmid), {
                cores: cpuCores
            });

            // CPU 配置通常是立即執行，不返回 UPID
            if (configResp && configResp.data === null) {
                return { success: true };
            }

            // 如果返回 UPID（字符串），則返回任務 ID
            if (configResp && configResp.data && typeof configResp.data === 'string') {
                return { success: true, upid: configResp.data };
            }

            return { success: false, errorMessage: "Failed to configure CPU cores - no response data" };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Unknown error";
            return { success: false, errorMessage: errorMsg };
        }
    }

    /**
     * 配置 VM 記憶體
     */
    static async configureVMMemory(node: string, vmid: string, memorySize: number): Promise<{ success: boolean, upid?: string, errorMessage?: string }> {
        try {
            const configResp: PVEResp = await callPVE('PUT', pve_api.nodes_qemu_config(node, vmid), {
                memory: memorySize
            });

            // Memory 配置通常是立即執行，不返回 UPID
            if (configResp && configResp.data === null) {
                return { success: true };
            }

            // 如果返回 UPID（字符串），則返回任務 ID
            if (configResp && configResp.data && typeof configResp.data === 'string') {
                return { success: true, upid: configResp.data };
            }

            return { success: false, errorMessage: "Failed to configure memory - no response data" };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Unknown error";
            return { success: false, errorMessage: errorMsg };
        }
    }

    /**
     * 調整 VM 磁碟大小
     */
    static async resizeVMDisk(node: string, vmid: string, diskSize: number): Promise<{ success: boolean, upid?: string, errorMessage?: string }> {
        try {
            const resizeResp: PVEResp = await callPVE('PUT', pve_api.nodes_qemu_resize(node, vmid), {
                disk: 'scsi0',
                size: `${diskSize}G`
            });

            // Disk resize 通常是立即執行，不返回 UPID
            if (resizeResp && resizeResp.data === null) {
                return { success: true };
            }

            // 如果返回 UPID（字符串），則返回任務 ID
            if (resizeResp && resizeResp.data && typeof resizeResp.data === 'string') {
                return { success: true, upid: resizeResp.data };
            }

            return { success: false, errorMessage: "Failed to resize disk - no response data" };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Unknown error";
            return { success: false, errorMessage: errorMsg };
        }
    }

    /**
     * 配置 Cloud-Init
     */
    static async configureCloudInit(node: string, vmid: string, ciuser: string, cipassword: string): Promise<{ success: boolean, upid?: string, errorMessage?: string }> {
        try {
            const configData: any = {};
            if (ciuser) {
                configData.ciuser = ciuser;
            }
            if (cipassword) {
                configData.cipassword = cipassword;
            }

            if (Object.keys(configData).length === 0) {
                return { success: true };
            }

            const configResp: PVEResp = await callPVE('PUT', pve_api.nodes_qemu_config(node, vmid), configData);

            // Cloud-Init 配置通常是立即執行，不返回 UPID
            if (configResp && configResp.data === null) {
                return { success: true };
            }

            // 如果返回 UPID（字符串），則返回任務 ID
            if (configResp && configResp.data && typeof configResp.data === 'string') {
                return { success: true, upid: configResp.data };
            }

            return { success: false, errorMessage: "Failed to configure cloud-init - no response data" };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Unknown error";
            return { success: false, errorMessage: errorMsg };
        }
    }

    /**
     * 等待任務完成
     */
    static async waitForTaskCompletion(node: string, upid: string, operationType: string = 'Task'): Promise<{ success: boolean, errorMessage?: string }> {
        const maxRetries = 300; // 最多等待 5 分鐘
        let retries = 0;

        while (retries < maxRetries) {
            try {
                const taskStatus: PVEResp = await callPVE('GET', pve_api.nodes_tasks_status(node, upid), undefined);

                if (taskStatus && taskStatus.data) {
                    const status = taskStatus.data as PVE_Task_Status_Response;
                    
                    if (status.status === PVE_TASK_STATUS.STOPPED) {
                        if (status.exitstatus === PVE_TASK_EXIT_STATUS.OK) {
                            return { success: true };
                        } else {
                            return { success: false, errorMessage: `${operationType} failed with exit status: ${status.exitstatus}` };
                        }
                    }
                    
                    // 任務仍在運行，等待 1 秒後重試
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    retries++;
                } else {
                    return { success: false, errorMessage: "Failed to get task status" };
                }
            } catch (error) {
                logger.error(`Error checking ${operationType} task status for ${upid}:`, error);
                return { success: false, errorMessage: error instanceof Error ? error.message : "Unknown error" };
            }
        }

        return { success: false, errorMessage: `${operationType} task timeout` };
    }

    /**
     * 獲取 VM 當前配置
     */
    static async getCurrentVMConfig(node: string, vmid: string): Promise<any> {
        try {
            const configResp: PVEResp = await callPVE('GET', pve_api.nodes_qemu_config(node, vmid), undefined);

            if (configResp && configResp.data) {
                return configResp.data;
            }
            return null;
        } catch (error) {
            logger.error(`Error getting VM config for node ${node}, vmid ${vmid}:`, error);
            return null;
        }
    }

    /**
     * 獲取 VM 狀態
     */
    static async getVMStatus(node: string, vmid: string): Promise<{ status: string; uptime?: number } | null> {
        try {
            const statusResp: PVEResp = await callPVE('GET', pve_api.nodes_qemu_status(node, vmid), undefined);

            if (statusResp && statusResp.data) {
                return {
                    status: statusResp.data.status,
                    uptime: statusResp.data.uptime
                };
            }
            return null;
        } catch (error) {
            logger.error(`Error getting VM status for node ${node}, vmid ${vmid}:`, error);
            return null;
        }
    }

    /**
     * 重新生成 VM 的 Cloud-Init 配置
     */
    static async regenerateCloudInit(node: string, vmid: string): Promise<{ success: boolean, upid?: string, errorMessage?: string }> {
        try {
            logger.info(`Regenerating cloud-init for VM ${vmid} on node ${node}`);
            
            // 使用 PUT 請求觸發 cloud-init 重新生成
            const regenResp: PVEResp = await callPVE('PUT', pve_api.nodes_qemu_cloudinit(node, vmid), undefined, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

            // Cloud-init 重新生成成功時可能返回空 data，這是正常的
            if (regenResp) {
                if (regenResp.data) {
                    logger.info(`Cloud-init regeneration initiated for VM ${vmid}, UPID: ${regenResp.data}`);
                    return { success: true, upid: regenResp.data };
                } else {
                    logger.info(`Cloud-init regeneration completed successfully for VM ${vmid} (no UPID returned)`);
                    return { success: true };
                }
            } else {
                logger.error(`Failed to regenerate cloud-init for VM ${vmid}: No response received`);
                return { success: false, errorMessage: "No response received from cloud-init regeneration request" };
            }
        } catch (error) {
            logger.error(`Error regenerating cloud-init for VM ${vmid}:`, error);
            return { success: false, errorMessage: error instanceof Error ? error.message : "Unknown error during cloud-init regeneration" };
        }
    }

    /**
     * 獲取 VM 的網路信息 (透過 QEMU Guest Agent)
     */
    static async getVMNetworkInfo(node: string, vmid: string): Promise<{ success: boolean, interfaces?: NetworkInterface[], errorMessage?: string }> {
        try {
            logger.info(`Getting network interfaces for VM ${vmid} on node ${node} via QEMU Guest Agent`);
            
            const networkResp: PVEResp = await callPVE('GET', pve_api.nodes_qemu_agent_network(node, vmid), undefined);

            if (networkResp && networkResp.data) {
                const interfaces = Array.isArray(networkResp.data)
                    ? networkResp.data
                    : Array.isArray((networkResp.data as any).result)
                        ? (networkResp.data as any).result
                        : [];
                logger.info(`Successfully retrieved network interfaces for VM ${vmid}`);
                return { success: true, interfaces };
            } else {
                logger.warn(`No network interface data available for VM ${vmid} (Guest Agent may not be running)`);
                return { success: true, interfaces: [] };
            }
        } catch (error) {
            logger.error(`Error getting network info for VM ${vmid}:`, error);
            return { success: false, errorMessage: error instanceof Error ? error.message : "Unknown error getting network info" };
        }
    }

    /**
     * 提取 IP 地址從網路接口信息
     */
    static extractIPAddresses(interfaces: NetworkInterface[]): string[] {
        const ipAddresses: string[] = [];
        
        if (!interfaces || !Array.isArray(interfaces)) {
            return ipAddresses;
        }

        interfaces.forEach(iface => {
            if (iface['ip-addresses'] && Array.isArray(iface['ip-addresses'])) {
                iface['ip-addresses'].forEach((ip: NetworkIPAddress) => {
                    if (ip['ip-address'] && ip['ip-address-type'] === 'ipv4') {
                        // 排除回環地址
                        if (!ip['ip-address'].startsWith('127.')) {
                            ipAddresses.push(ip['ip-address']);
                        }
                    }
                });
            }
        });

        return ipAddresses;
    }

    static async executeGuestAgentCommand(node: string, vmid: string, command: string, timeoutMs: number = 60000): Promise<GuestAgentCommandResult> {
        try {
            const execResp: PVEResp = await callPVE('POST', pve_api.nodes_qemu_agent_exec(node, vmid), {
                command: ['bash', '-lc', command]
            });

            const pid = (execResp?.data as any)?.pid;
            if (pid === undefined || pid === null) {
                return { success: false, errorMessage: "QEMU guest agent did not return an exec pid" };
            }

            const startedAt = Date.now();
            while (Date.now() - startedAt < timeoutMs) {
                const statusResp: PVEResp = await callPVE('GET', pve_api.nodes_qemu_agent_exec_status(node, vmid, pid), undefined);

                const data = statusResp?.data as any;
                if (data?.exited) {
                    const exitCode = typeof data.exitcode === 'number' ? data.exitcode : -1;
                    const stdout = typeof data['out-data'] === 'string' ? data['out-data'] : "";
                    const stderr = typeof data['err-data'] === 'string' ? data['err-data'] : "";
                    return {
                        success: exitCode === 0,
                        exitCode,
                        stdout,
                        stderr,
                        errorMessage: exitCode === 0 ? undefined : `Guest command exited with code ${exitCode}`
                    };
                }

                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            return { success: false, errorMessage: `Guest command timed out after ${timeoutMs}ms` };
        } catch (error) {
            logger.error(`Error executing guest agent command for VM ${vmid}:`, error);
            return { success: false, errorMessage: error instanceof Error ? error.message : "Unknown guest agent exec error" };
        }
    }

    static async waitForGuestAgentCommand(node: string, vmid: string, command: string, timeoutMs: number = 120000): Promise<GuestAgentCommandResult> {
        const deadline = Date.now() + timeoutMs;
        let lastError = "QEMU guest agent was not ready";

        while (Date.now() < deadline) {
            const remaining = Math.max(5000, Math.min(30000, deadline - Date.now()));
            const result = await this.executeGuestAgentCommand(node, vmid, command, remaining);
            if (typeof result.exitCode === 'number') {
                return result;
            }
            lastError = result.errorMessage || lastError;
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        return { success: false, errorMessage: lastError };
    }

    static async ensureUniqueGuestNetworkIdentity(node: string, vmid: string, timeoutMs: number = 180000): Promise<GuestAgentCommandResult> {
        const script = [
            'set -euo pipefail',
            'marker="/var/lib/cstg/vm-network-identity-normalized"',
            'if [ -f "$marker" ]; then',
            '  echo "network_identity=already-normalized"',
            '  printf "machine_id="; cat /etc/machine-id 2>/dev/null || true',
            '  ip -4 -o addr show scope global || true',
            '  exit 0',
            'fi',
            'iface="$(ip -o link show | awk -F\': \' \'$2 != "lo" {print $2; exit}\' | cut -d"@" -f1)"',
            'if [ -z "$iface" ]; then echo "No non-loopback interface found"; exit 2; fi',
            'old_id="$(cat /etc/machine-id 2>/dev/null || true)"',
            'rm -f /etc/machine-id /var/lib/dbus/machine-id',
            'systemd-machine-id-setup || dbus-uuidgen --ensure=/etc/machine-id',
            'ln -sf /etc/machine-id /var/lib/dbus/machine-id || true',
            "netplan_files=\"$(find /etc/netplan -maxdepth 1 -type f \\( -name '*.yaml' -o -name '*.yml' \\) 2>/dev/null || true)\"",
            'if [ -n "$netplan_files" ] && grep -Rqs "dhcp4:[[:space:]]*true" /etc/netplan; then',
            '  cp -a /etc/netplan "/etc/netplan.cstg-backup-$(date +%s)" 2>/dev/null || true',
            '  rm -f /etc/netplan/99-cstg-dhcp-identity.yaml',
            '  cat > /etc/netplan/50-cloud-init.yaml <<YAML',
            'network:',
            '  version: 2',
            '  ethernets:',
            '    ${iface}:',
            '      dhcp4: true',
            '      dhcp-identifier: mac',
            'YAML',
            '  chmod 600 /etc/netplan/50-cloud-init.yaml',
            '  netplan generate || true',
            'fi',
            'if systemctl is-active --quiet systemd-networkd && [ -z "$netplan_files" ]; then',
            '  mkdir -p /etc/systemd/network',
            '  cat > /etc/systemd/network/99-cstg-dhcp-identity.network <<EOF',
            '[Match]',
            'Name=${iface}',
            '',
            '[Network]',
            'DHCP=yes',
            '',
            '[DHCPv4]',
            'ClientIdentifier=mac',
            'EOF',
            'fi',
            'rm -f /run/systemd/netif/leases/* /var/lib/systemd/network/* /var/lib/systemd/networkd/* /var/lib/dhcp/* /var/lib/NetworkManager/*lease* /var/lib/NetworkManager/*leases* 2>/dev/null || true',
            'ip addr flush dev "$iface" || true',
            'if command -v netplan >/dev/null 2>&1; then timeout 40 netplan apply || true; fi',
            'if systemctl is-active --quiet systemd-networkd; then networkctl renew "$iface" 2>/dev/null || systemctl restart systemd-networkd || true; fi',
            'if systemctl is-active --quiet NetworkManager; then nmcli dev reapply "$iface" 2>/dev/null || nmcli con reload || true; fi',
            'sleep 8',
            'mkdir -p "$(dirname "$marker")"',
            'touch "$marker"',
            'echo "network_identity=normalized"',
            'echo "interface=$iface"',
            'echo "old_machine_id=$old_id"',
            'printf "new_machine_id="; cat /etc/machine-id 2>/dev/null || true',
            'ip -4 -o addr show dev "$iface" || true'
        ].join('\n');

        return this.waitForGuestAgentCommand(node, vmid, script, timeoutMs);
    }

    /**
     * 啟動 VM
     */
    static async startVM(node: string, vmid: string): Promise<{ success: boolean, upid?: string, errorMessage?: string }> {
        try {
            logger.info(`Starting VM ${vmid} on node ${node}`);
            
            const startResp: PVEResp = await callPVE('POST', pve_api.nodes_qemu_start(node, vmid), undefined, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

            if (startResp && startResp.data) {
                logger.info(`VM ${vmid} start command executed, UPID: ${startResp.data}`);
                return { success: true, upid: startResp.data };
            } else {
                logger.error(`Failed to start VM ${vmid}: No response data`);
                return { success: false, errorMessage: "No response data from start command" };
            }
        } catch (error) {
            logger.error(`Error starting VM ${vmid}:`, error);
            return { success: false, errorMessage: error instanceof Error ? error.message : "Unknown error starting VM" };
        }
    }

    /**
     * 正常關機 VM (shutdown)
     */
    static async shutdownVM(node: string, vmid: string): Promise<{ success: boolean, upid?: string, errorMessage?: string }> {
        try {
            logger.info(`Shutting down VM ${vmid} on node ${node}`);
            
            const shutdownResp: PVEResp = await callPVE('POST', pve_api.nodes_qemu_shutdown(node, vmid), undefined, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

            if (shutdownResp && shutdownResp.data) {
                logger.info(`VM ${vmid} shutdown command executed, UPID: ${shutdownResp.data}`);
                return { success: true, upid: shutdownResp.data };
            } else {
                logger.error(`Failed to shutdown VM ${vmid}: No response data`);
                return { success: false, errorMessage: "No response data from shutdown command" };
            }
        } catch (error) {
            logger.error(`Error shutting down VM ${vmid}:`, error);
            return { success: false, errorMessage: error instanceof Error ? error.message : "Unknown error shutting down VM" };
        }
    }

    /**
     * 強制停止 VM (stop/poweroff)
     */
    static async stopVM(node: string, vmid: string): Promise<{ success: boolean, upid?: string, errorMessage?: string }> {
        try {
            logger.info(`Stopping VM ${vmid} on node ${node} (force)`);
            
            const stopResp: PVEResp = await callPVE('POST', pve_api.nodes_qemu_stop(node, vmid), undefined, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

            if (stopResp && stopResp.data) {
                logger.info(`VM ${vmid} stop command executed, UPID: ${stopResp.data}`);
                return { success: true, upid: stopResp.data };
            } else {
                logger.error(`Failed to stop VM ${vmid}: No response data`);
                return { success: false, errorMessage: "No response data from stop command" };
            }
        } catch (error) {
            logger.error(`Error stopping VM ${vmid}:`, error);
            return { success: false, errorMessage: error instanceof Error ? error.message : "Unknown error stopping VM" };
        }
    }

    /**
     * 重啟 VM (reboot)
     */
    static async rebootVM(node: string, vmid: string): Promise<{ success: boolean, upid?: string, errorMessage?: string }> {
        try {
            logger.info(`Rebooting VM ${vmid} on node ${node}`);
            
            const rebootResp: PVEResp = await callPVE('POST', pve_api.nodes_qemu_reboot(node, vmid), undefined, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

            if (rebootResp && rebootResp.data) {
                logger.info(`VM ${vmid} reboot command executed, UPID: ${rebootResp.data}`);
                return { success: true, upid: rebootResp.data };
            } else {
                logger.error(`Failed to reboot VM ${vmid}: No response data`);
                return { success: false, errorMessage: "No response data from reboot command" };
            }
        } catch (error) {
            logger.error(`Error rebooting VM ${vmid}:`, error);
            return { success: false, errorMessage: error instanceof Error ? error.message : "Unknown error rebooting VM" };
        }
    }

    /**
     * 重置 VM (reset)
     */
    static async resetVM(node: string, vmid: string): Promise<{ success: boolean, upid?: string, errorMessage?: string }> {
        try {
            logger.info(`Resetting VM ${vmid} on node ${node}`);
            
            const resetResp: PVEResp = await callPVE('POST', pve_api.nodes_qemu_reset(node, vmid), undefined, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

            if (resetResp && resetResp.data) {
                logger.info(`VM ${vmid} reset command executed, UPID: ${resetResp.data}`);
                return { success: true, upid: resetResp.data };
            } else {
                logger.error(`Failed to reset VM ${vmid}: No response data`);
                return { success: false, errorMessage: "No response data from reset command" };
            }
        } catch (error) {
            logger.error(`Error resetting VM ${vmid}:`, error);
            return { success: false, errorMessage: error instanceof Error ? error.message : "Unknown error resetting VM" };
        }
    }

    /**
     * 獲取 VM 資源使用情況（CPU、記憶體使用率）
     */
    static async getVMResourceUsage(node: string, vmid: string): Promise<{ success: boolean, cpu?: number, memory?: number, errorMessage?: string }> {
        try {
            // 首先嘗試獲取當前狀態，這會提供實時的資源使用情況
            const statusResp: PVEResp = await callPVE('GET', pve_api.nodes_qemu_status(node, vmid), undefined);

            if (statusResp && statusResp.data) {
                // 從狀態 API 獲取實時資源使用情況
                const cpuUsage = statusResp.data.cpu ? (statusResp.data.cpu * 100) : 0; // 轉換為百分比
                const memoryUsage = statusResp.data.mem && statusResp.data.maxmem 
                    ? (statusResp.data.mem / (1024 * 1024 * 1024)) : 0; // 轉換為 GB

                return { 
                    success: true, 
                    cpu: Math.round(cpuUsage * 100) / 100, // 保留兩位小數
                    memory: Math.round(memoryUsage * 100) / 100 // 保留兩位小數
                };
            }

            // 如果狀態 API 沒有提供資源使用數據，則回退到 RRD 數據（最近 5 分鐘，最高解析度）
            const rrdResp: PVEResp = await callPVE('GET', `${pve_api.nodes_qemu_rrddata(node, vmid)}?timeframe=5min&cf=AVERAGE`, undefined);

            if (rrdResp && rrdResp.data && Array.isArray(rrdResp.data)) {
                // 獲取最新的數據點
                const latestData = rrdResp.data[rrdResp.data.length - 1];
                if (latestData) {
                    const cpuUsage = latestData.cpu ? (latestData.cpu * 100) : 0; // 轉換為百分比
                    const memoryUsage = latestData.mem ? (latestData.mem / (1024 * 1024 * 1024)) : 0; // 轉換為 GB

                    return { 
                        success: true, 
                        cpu: Math.round(cpuUsage * 100) / 100, // 保留兩位小數
                        memory: Math.round(memoryUsage * 100) / 100 // 保留兩位小數
                    };
                }
            }

            return { success: false, errorMessage: "No resource usage data available" };
        } catch (error) {
            logger.error(`Error getting resource usage for VM ${vmid}:`, error);
            return { success: false, errorMessage: error instanceof Error ? error.message : "Unknown error getting resource usage" };
        }
    }

    /**
     * 更新 VM 名稱
     */
    static async updateVMName(node: string, vmid: string, vmName: string): Promise<{ success: boolean, upid?: string, errorMessage?: string }> {
        try {
            logger.info(`Updating VM ${vmid} name to: ${vmName}`);
            
            const nameUpdateResp: PVEResp = await callPVE('PUT', pve_api.nodes_qemu_config(node, vmid), {
                name: vmName
            });

            // 名稱更新通常是立即執行，不返回 UPID
            if (nameUpdateResp && nameUpdateResp.data === null) {
                logger.info(`Successfully updated VM ${vmid} name to: ${vmName}`);
                return { success: true };
            }

            // 如果返回 UPID（字符串），則返回任務 ID
            if (nameUpdateResp && nameUpdateResp.data && typeof nameUpdateResp.data === 'string') {
                logger.info(`VM ${vmid} name update initiated with UPID: ${nameUpdateResp.data}`);
                return { success: true, upid: nameUpdateResp.data };
            }

            return { success: false, errorMessage: "Failed to update VM name - no response data" };
        } catch (error) {
            logger.error(`Error updating VM ${vmid} name:`, error);
            return { success: false, errorMessage: error instanceof Error ? error.message : "Unknown error updating VM name" };
        }
    }

    /**
     * 將 VM 轉換為模板
     */
    static async convertVMToTemplate(node: string, vmid: string, templateName?: string): Promise<{ success: boolean, upid?: string, errorMessage?: string }> {
        try {
            logger.info(`Converting VM ${vmid} to template on node ${node}${templateName ? ` with name: ${templateName}` : ''}`);
            
            // 先更新 VM 名稱（如果提供的話）
            if (templateName) {
                const nameUpdateResult = await this.updateVMName(node, vmid, templateName);
                if (!nameUpdateResult.success) {
                    logger.error(`Failed to update VM name before template conversion: ${nameUpdateResult.errorMessage}`);
                    return { success: false, errorMessage: `Failed to update VM name: ${nameUpdateResult.errorMessage}` };
                }
                
                // 如果名稱更新有 UPID，等待完成
                if (nameUpdateResult.upid) {
                    const waitResult = await this.waitForTaskCompletion(node, nameUpdateResult.upid, 'VM name update');
                    if (!waitResult.success) {
                        return { success: false, errorMessage: `VM name update failed: ${waitResult.errorMessage}` };
                    }
                }
            }
            
            // 將 VM 轉換為模板
            const convertResp: PVEResp = await callPVE('POST', pve_api.nodes_qemu_template(node, vmid), undefined, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

            // 模板轉換通常是立即執行，不返回 UPID
            if (convertResp && convertResp.data === null) {
                logger.info(`Successfully converted VM ${vmid} to template`);
                return { success: true };
            }

            // 如果返回 UPID（字符串），則返回任務 ID
            if (convertResp && convertResp.data && typeof convertResp.data === 'string') {
                logger.info(`VM ${vmid} template conversion initiated with UPID: ${convertResp.data}`);
                return { success: true, upid: convertResp.data };
            }

            return { success: false, errorMessage: "Failed to convert VM to template - no response data" };
        } catch (error) {
            logger.error(`Error converting VM ${vmid} to template:`, error);
            return { success: false, errorMessage: error instanceof Error ? error.message : "Unknown error converting VM to template" };
        }
    }

    /**
     * 刪除模板
     */
    static async deleteTemplate(pve_node: string, pve_vmid: string): Promise<{ success: boolean, upid?: string, errorMessage?: string }> {
        try {
            logger.info(`[VMUtils.deleteTemplate] Attempting to delete template from PVE: node=${pve_node}, vmid=${pve_vmid}`);

            // 按照 PVE API 標準，直接使用 DELETE 方法，不需要 body 參數
            const deleteResp: PVEResp = await callPVE(
                'DELETE', 
                pve_api.nodes_qemu_vm(pve_node, pve_vmid), 
                undefined // DELETE 請求不需要 body
            );
            
            logger.debug(`[VMUtils.deleteTemplate] Delete response received with type: ${typeof deleteResp}`);
            
            // 檢查響應
            if (typeof deleteResp === 'string') {
                logger.debug(`[VMUtils.deleteTemplate] Received string response`);
                // 如果響應是錯誤信息字符串
                if (deleteResp.includes('Unexpected content') || deleteResp.includes('error')) {
                    return { 
                        success: false, 
                        errorMessage: `PVE API error: ${deleteResp}` 
                    };
                }
                // 否則可能是成功但沒有 UPID
                return { success: true };
            }
            
            // 檢查是否有任務 ID 需要等待
            if (deleteResp && deleteResp.data && typeof deleteResp.data === 'string') {
                const taskId = deleteResp.data;
                logger.info(`[VMUtils.deleteTemplate] Template deletion initiated with UPID: ${taskId}`);
                return { success: true, upid: taskId };
            } else {
                logger.info(`[VMUtils.deleteTemplate] Template deletion completed immediately (no UPID)`);
                return { success: true };
            }

        } catch (error) {
            logger.error(`[VMUtils.deleteTemplate] Error deleting template from PVE:`, error);
            
            // 檢查是否是因為模板不存在而失敗 (404 錯誤)
            if (error instanceof Error && error.message.includes('404')) {
                logger.info(`[VMUtils.deleteTemplate] Template ${pve_vmid} not found in PVE`);
                return { success: true }; // 模板不存在視為成功刪除
            }
            
            return { 
                success: false, 
                errorMessage: error instanceof Error ? error.message : 'Unknown error deleting template' 
            };
        }
    }
}
