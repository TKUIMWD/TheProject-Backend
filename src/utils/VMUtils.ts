import { callWithUnauthorized } from "./fetch";
import { pve_api } from "../enum/PVE_API";
import { PVEResp } from "../interfaces/Response/PVEResp";
import { resp, createResponse } from "./resp";
import { VMBasicConfig, VMDetailedConfig } from "../interfaces/VM/VM";
import { PVE_qemu_config, PVE_Task_Status_Response, PVE_TASK_STATUS, PVE_TASK_EXIT_STATUS } from "../interfaces/PVE";
import { logger } from "../middlewares/log";
import { PVEUtils } from "./PVEUtils";

const PVE_API_ADMINMODE_TOKEN = process.env.PVE_API_ADMINMODE_TOKEN;
const PVE_API_SUPERADMINMODE_TOKEN = process.env.PVE_API_SUPERADMINMODE_TOKEN;
const PVE_API_USERMODE_TOKEN = process.env.PVE_API_USERMODE_TOKEN;


/*
 * - validateVMCreationParams: 驗證VM創建參數
 * - cloneVM: 克隆VM
 * - configureVMCPU: 配置VM CPU核心數
 * - configureVMMemory: 配置VM記憶體
 * - resizeVMDisk: 調整VM磁碟大小
 * - configureCloudInit: 配置Cloud-Init
 * - waitForTaskCompletion: 等待任務完成
 * - getCurrentVMConfig: 獲取VM當前配置
 * - getBasicQemuConfig: 獲取基本QEMU配置
 * - getDetailedQemuConfig: 獲取詳細QEMU配置
 * - getNextVMId: 獲取下一個可用VM ID
 * - getTemplateInfo: 獲取範本資訊
 * - getVMConfig: 獲取VM配置
 * - forceCleanupVMDisks: 強制清理VM磁碟
 * - waitForVMDiskReady: 等待VM磁碟準備就緒
 * - deleteVMWithDiskCleanup: 刪除VM並清理磁碟
 * - extractDiskSizeFromConfig: 從配置中提取磁碟大小
 */


export class VMUtils {
    
    /**
     * 獲取 VM 的基本配置資訊
     */
    static async getBasicQemuConfig(node: string, vmid: string): Promise<resp<VMBasicConfig | undefined>> {
        try {
            const qemuResp: PVEResp = await callWithUnauthorized('GET', pve_api.nodes_qemu_config(node, vmid), undefined, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                }
            });

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
            console.error("Error in getBasicQemuConfig:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * 獲取 VM 的詳細配置資訊
     */
    static async getDetailedQemuConfig(node: string, vmid: string): Promise<resp<VMDetailedConfig | undefined>> {
        try {
            const qemuResp: PVEResp = await callWithUnauthorized('GET', pve_api.nodes_qemu_config(node, vmid), undefined, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                }
            });

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
            console.error("Error in getDetailedQemuConfig:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * 獲取下一個可用的 VM ID
     */
    static async getNextVMId(): Promise<resp<PVEResp | undefined>> {
        try {
            const nextId: PVEResp = await callWithUnauthorized('GET', pve_api.cluster_next_id, undefined, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_USERMODE_TOKEN}`
                }
            });
            return createResponse(200, "Next ID fetched successfully", nextId);
        } catch (error) {
            console.error("Error in getNextVMId:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * 獲取範本資訊
     */
    static async getTemplateInfo(node: string, vmid: string): Promise<resp<PVE_qemu_config | undefined>> {
        try {
            const qemuResp: PVEResp = await callWithUnauthorized('GET', pve_api.nodes_qemu_config(node, vmid), undefined, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                }
            });

            if (qemuResp && qemuResp.data) {
                return createResponse(200, "Template info fetched successfully", qemuResp.data);
            } else {
                return createResponse(404, "Template not found or invalid response");
            }
        } catch (error) {
            console.error("Error in getTemplateInfo:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * 獲取 VM 配置（用於磁碟清理）
     */
    static async getVMConfig(pve_node: string, pve_vmid: string): Promise<any> {
        try {
            const configResp: any = await callWithUnauthorized('GET', pve_api.nodes_qemu_config(pve_node, pve_vmid), undefined, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                }
            });
            
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
                        await callWithUnauthorized('DELETE', pve_api.nodes_storage_content(pve_node, storage, `${storage}:${volumeId}`), undefined, {
                            headers: {
                                'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                            }
                        });
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
            console.log(`Waiting for VM ${vmid} disk to be ready...`);
            
            let retries = 0;
            while (retries < maxRetries) {
                try {
                    const configResp: any = await callWithUnauthorized('GET', pve_api.nodes_qemu_config(target_node, vmid), undefined, {
                        headers: {
                            'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                        }
                    });
                    
                    if (configResp && configResp.data && configResp.data.scsi0) {
                        console.log(`VM ${vmid} disk is ready, found scsi0: ${configResp.data.scsi0}`);
                        return { success: true };
                    }
                    
                    console.log(`VM ${vmid} disk not ready yet, retrying in 3 seconds... (${retries + 1}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    retries++;
                } catch (error) {
                    console.log(`Error checking VM ${vmid} disk status: ${error}, retrying... (${retries + 1}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    retries++;
                }
            }
            
            return { success: false, errorMessage: `VM ${vmid} disk not ready after ${maxRetries} retries` };
        } catch (error) {
            console.error(`Error waiting for VM ${vmid} disk to be ready:`, error);
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
            
            const deleteResp: PVEResp = await callWithUnauthorized('DELETE', pve_api.nodes_qemu_vm(pve_node, pve_vmid), deleteParams, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                }
            });

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
            console.log(`Waiting for ${operationType} completion with UPID ${upid} on node ${node}`);
            
            const maxRetries = 120; // 最多等待 600 秒 (120 * 5 秒)
            let retries = 0;
            
            while (retries < maxRetries) {
                try {
                    const statusResp: any = await callWithUnauthorized('GET', pve_api.nodes_tasks_status(node, upid), undefined, {
                        headers: {
                            'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                        }
                    });
                    
                    if (statusResp && statusResp.data) {
                        const { status, exitstatus } = statusResp.data;
                        
                        if (status === 'stopped') {
                            if (exitstatus === 'OK') {
                                console.log(`${operationType} task ${upid} completed successfully`);
                                return { success: true };
                            } else {
                                console.log(`${operationType} task ${upid} failed with exit status: ${exitstatus}`);
                                return { success: false, errorMessage: `Task failed with exit status: ${exitstatus}` };
                            }
                        } else if (status === 'running') {
                            console.log(`${operationType} task ${upid} is still running...`);
                        }
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    retries++;
                } catch (error) {
                    console.log(`Error checking ${operationType} task status: ${error}, retrying... (${retries + 1}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    retries++;
                }
            }
            
            return { success: false, errorMessage: `${operationType} task ${upid} did not complete within timeout` };
        } catch (error) {
            console.error(`Error waiting for ${operationType} task completion:`, error);
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
            console.log(`Cloning template ${sourceVmid} from node ${sourceNode} to ${targetNode} with new ID ${newVmid}`);

            // 克隆任務在源節點上執行，通過 target 參數指定目標節點
            const cloneResp: PVEResp = await callWithUnauthorized('POST', pve_api.nodes_qemu_clone(sourceNode, sourceVmid), {
                newid: newVmid,
                name: vmName,
                target: targetNode,  // 指定目標節點
                storage: storage,
                full: full,
            }, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                }
            });

            if (cloneResp && cloneResp.data) {
                logger.info(`Clone operation initiated for VM ${newVmid} with UPID: ${cloneResp.data}`);
                return { success: true, upid: cloneResp.data };
            } else {
                return { success: false, errorMessage: "No UPID returned from clone operation" };
            }
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
            const configResp: PVEResp = await callWithUnauthorized('PUT', pve_api.nodes_qemu_config(node, vmid), {
                cores: cpuCores
            }, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                }
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
            const configResp: PVEResp = await callWithUnauthorized('PUT', pve_api.nodes_qemu_config(node, vmid), {
                memory: memorySize
            }, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                }
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
            const resizeResp: PVEResp = await callWithUnauthorized('PUT', pve_api.nodes_qemu_resize(node, vmid), {
                disk: 'scsi0',
                size: `${diskSize}G`
            }, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                }
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

            const configResp: PVEResp = await callWithUnauthorized('PUT', pve_api.nodes_qemu_config(node, vmid), configData, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                }
            });

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
                const taskStatus: PVEResp = await callWithUnauthorized('GET', pve_api.nodes_tasks_status(node, upid), undefined, {
                    headers: {
                        'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                    }
                });

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
            const configResp: PVEResp = await callWithUnauthorized('GET', pve_api.nodes_qemu_config(node, vmid), undefined, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                }
            });

            if (configResp && configResp.data) {
                return configResp.data;
            }
            return null;
        } catch (error) {
            logger.error(`Error getting VM config for node ${node}, vmid ${vmid}:`, error);
            return null;
        }
    }
}
