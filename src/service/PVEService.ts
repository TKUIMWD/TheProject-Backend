import { Service } from "../abstract/Service";
import { resp, createResponse } from "../utils/resp";
import { PVEResp } from "../interfaces/Response/PVEResp";
import { Request } from "express";
import { getTokenRole, validateTokenAndGetAdminUser, validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { pve_api } from "../enum/PVE_API";
import { callWithUnauthorized } from "../utils/fetch";
import { PVE_Task_Status_Response, PVE_TASK_STATUS, PVE_TASK_EXIT_STATUS } from "../interfaces/PVE";
import { VM_TaskModel } from "../orm/schemas/VM/VM_TaskSchemas";
import { VM_Task, VM_Task_Status, VM_Task_Update, VM_Task_With_PVE_Status, VM_Task_Query } from "../interfaces/VM/VM_Task";
import { VMModel } from "../orm/schemas/VM/VMSchemas";
import { User } from "../interfaces/User";
import { VMDetailedConfig, VMBasicConfig } from "../interfaces/VM/VM";
import { DeleteResult } from "mongodb";
import { PVEUtils } from "../utils/PVEUtils";

const PVE_API_ADMINMODE_TOKEN = process.env.PVE_API_ADMINMODE_TOKEN;
const PVE_API_SUPERADMINMODE_TOKEN = process.env.PVE_API_SUPERADMINMODE_TOKEN;
const PVE_API_USERMODE_TOKEN = process.env.PVE_API_USERMODE_TOKEN;


export class PVEService extends Service {

    public async getQemuConfig(Request: Request): Promise<resp<PVEResp | undefined>> {
        try {
            const token_role = (await getTokenRole(Request)).role;

            // 從 query parameter 獲取 VM ID
            const vm_id = Request.query.id as string;
            if (!vm_id) {
                return createResponse(400, "Missing vm_id in query parameters");
            }

            // 根據角色進行不同的驗證和處理
            if (token_role === 'user') {
                // 普通用戶只能查看自己擁有的 VM
                const { user, error } = await validateTokenAndGetUser<PVEResp>(Request);
                if (error) {
                    console.error("Error validating token:", error);
                    return error;
                }

                // 檢查 VM 是否屬於該用戶
                if (!user.owned_vms.includes(vm_id)) {
                    return createResponse(403, "Access denied: VM not owned by user");
                }

                // 獲取 VM 資訊
                const vm = await VMModel.findById(vm_id).exec();
                if (!vm) {
                    return createResponse(404, "VM not found");
                }

                // 獲取基本配置（用戶只能看到基本資訊）
                const config = await this._getBasicQemuConfig(vm.pve_node, vm.pve_vmid);
                return config;

            } else if (token_role === 'admin') {
                // 管理員只能查看自己擁有的 VM
                const { user, error } = await validateTokenAndGetAdminUser<PVEResp>(Request);
                if (error) {
                    console.error("Error validating token:", error);
                    return error;
                }

                // 檢查 VM 是否屬於該用戶
                if (!user.owned_vms.includes(vm_id)) {
                    return createResponse(403, "Access denied: VM not owned by user");
                }

                // 獲取 VM 資訊
                const vm = await VMModel.findById(vm_id).exec();
                if (!vm) {
                    return createResponse(404, "VM not found");
                }

                // 獲取詳細配置
                const config = await this._getDetailedQemuConfig(vm.pve_node, vm.pve_vmid);
                return config;

            } else if (token_role === 'superadmin') {
                // 超級管理員可以查看所有 VM 的完整配置
                const { user, error } = await validateTokenAndGetSuperAdminUser<PVEResp>(Request);
                if (error) {
                    console.error("Error validating token:", error);
                    return error;
                }

                // 獲取 VM 資訊
                const vm = await VMModel.findById(vm_id).exec();
                if (!vm) {
                    return createResponse(404, "VM not found");
                }

                // 獲取完整配置
                const config = await this._getFullQemuConfig(vm.pve_node, vm.pve_vmid);
                return config;

            } else {
                return createResponse(403, "Invalid role");
            }

        } catch (error) {
            console.error("Error in getQemuConfig:", error);
            return createResponse(500, "Internal Server Error");
        }
    }


    public async getNodes(Request: Request): Promise<resp<PVEResp | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<PVEResp>(Request);
            if (error) {
                console.error("Error validating token:", error);
                return error;
            }
            const nodes: PVEResp = await callWithUnauthorized('GET', pve_api.nodes, undefined, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_ADMINMODE_TOKEN}`
                }
            });
            return createResponse(200, "Nodes fetched successfully", nodes.data);
        } catch (error) {
            console.error("Error in getNodes:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // 檢視多個 VM 任務狀態的自定義接口
    public async getMultipleTasksStatus(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                console.error("Error validating token:", error);
                return error;
            }

            const { task_ids } = Request.body;

            if (!task_ids || !Array.isArray(task_ids) || task_ids.length === 0) {
                return createResponse(400, "task_ids must be a non-empty array");
            }

            const tasks = await VM_TaskModel.find({
                task_id: { $in: task_ids },
                user_id: user._id.toString()
            }).exec();

            if (tasks.length === 0) {
                return createResponse(200, "No tasks found for the provided task IDs", []);
            }

            const taskStatusPromises = tasks.map(async (task) => {
                return await this._getTaskWithPVEStatus(task);
            });

            const tasksWithStatus = await Promise.all(taskStatusPromises);

            return createResponse(200, "Multiple tasks status fetched successfully", tasksWithStatus);
        } catch (error) {
            console.error("Error in getMultipleTasksStatus:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // 獲取用戶所有 VM 任務的狀態
    public async getUserAllTasksStatus(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                console.error("Error validating token:", error);
                return error;
            }

            // 可選的分頁參數
            const page = parseInt(Request.query.page as string) || 1;
            const limit = parseInt(Request.query.limit as string) || 10;
            const status = Request.query.status as string; // 可選的狀態過濾

            // 建立查詢條件
            const query: VM_Task_Query = { user_id: user._id.toString() };
            if (status) {
                query.status = status as VM_Task_Status;
            }

            // 分頁查詢
            const skip = (page - 1) * limit;
            const tasks = await VM_TaskModel.find(query)
                .sort({ created_at: -1 }) // 按建立時間倒序
                .skip(skip)
                .limit(limit)
                .exec();

            const totalTasks = await VM_TaskModel.countDocuments(query);

            if (tasks.length === 0) {
                return createResponse(200, "No tasks found", {
                    tasks: [],
                    pagination: {
                        page,
                        limit,
                        total: totalTasks,
                        totalPages: Math.ceil(totalTasks / limit)
                    }
                });
            }

            // 並發檢查所有任務的 PVE 狀態
            const taskStatusPromises = tasks.map(async (task) => {
                return await this._getTaskWithPVEStatus(task);
            });

            const tasksWithStatus = await Promise.all(taskStatusPromises);

            return createResponse(200, "User tasks status fetched successfully", {
                tasks: tasksWithStatus,
                pagination: {
                    page,
                    limit,
                    total: totalTasks,
                    totalPages: Math.ceil(totalTasks / limit)
                }
            });
        } catch (error) {
            console.error("Error in getUserAllTasksStatus:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // 即時檢查 PVE 任務狀態並更新本地記錄
    public async refreshTaskStatus(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                console.error("Error validating token:", error);
                return error;
            }

            const { task_id } = Request.body;
            if (!task_id) {
                return createResponse(400, "task_id is required");
            }

            // 檢查任務是否屬於當前用戶
            const task = await VM_TaskModel.findOne({
                task_id: task_id,
                user_id: user._id.toString()
            }).exec();

            if (!task) {
                return createResponse(404, "Task not found or access denied");
            }

            // 獲取最新的 PVE 狀態並更新本地記錄
            const refreshedTask = await this._refreshAndUpdateTaskStatus(task);

            return createResponse(200, "Task status refreshed successfully", refreshedTask);
        } catch (error) {
            console.error("Error in refreshTaskStatus:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // 輔助方法：獲取任務及其 PVE 狀態
    private async _getTaskWithPVEStatus(task: VM_Task): Promise<VM_Task_With_PVE_Status> {
        try {
            const taskData: VM_Task_With_PVE_Status = {
                task_id: task.task_id,
                vmid: task.vmid,
                template_vmid: task.template_vmid,
                target_node: task.target_node,
                status: task.status,
                progress: task.progress,
                created_at: task.created_at,
                updated_at: task.updated_at,
                steps: task.steps,
                pve_status: null
            };

            // 如果任務有 PVE UPID，則檢查 PVE 狀態
            if (task.steps && task.steps.length > 0 && task.steps[0].pve_upid) {
                const pveStatus = await this._checkPVETaskStatus(task.target_node, task.steps[0].pve_upid);
                taskData.pve_status = pveStatus;
            }

            return taskData;
        } catch (error) {
            console.error(`Error getting task with PVE status for ${task.task_id}:`, error);
            return {
                task_id: task.task_id,
                vmid: task.vmid,
                template_vmid: task.template_vmid,
                target_node: task.target_node,
                status: task.status,
                progress: task.progress,
                created_at: task.created_at,
                updated_at: task.updated_at,
                steps: task.steps,
                pve_status: null
            };
        }
    }

    // 檢查 PVE 任務狀態
    private async _checkPVETaskStatus(node: string, upid: string): Promise<PVE_Task_Status_Response> {
        try {
            const statusResp: PVEResp = await callWithUnauthorized('GET', pve_api.nodes_tasks_status(node, upid), undefined, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                }
            });
            console.log(`Checking PVE task status for UPID ${upid} on node ${node}`);
            console.log("PVE task status response:", JSON.stringify(statusResp, null, 2));

            if (statusResp && statusResp.data) {
                return {
                    upid: upid,
                    node: node,
                    status: statusResp.data.status,
                    type: statusResp.data.type,
                    user: statusResp.data.user,
                    starttime: statusResp.data.starttime,
                    endtime: statusResp.data.endtime,
                    exitstatus: statusResp.data.exitstatus,
                    progress: statusResp.data.progress || 0
                };
            }

            return {
                upid: upid,
                node: node,
                status: PVE_TASK_STATUS.STOPPED,
                type: 'unknown',
                user: 'unknown',
                starttime: 0,
                error: "No PVE task data found"
            };
        } catch (error) {
            console.error(`Error checking PVE task status for ${upid}:`, error);

            // 如果是 JSON 解析錯誤，特別處理
            if (error instanceof SyntaxError && error.message.includes('JSON')) {
                console.error(`JSON parsing error for task ${upid}:`, error.message);
                return {
                    upid: upid,
                    node: node,
                    status: PVE_TASK_STATUS.STOPPED,
                    type: 'unknown',
                    user: 'unknown',
                    starttime: 0,
                    error: `JSON parsing error: ${error.message}`
                };
            }

            return {
                upid: upid,
                node: node,
                status: PVE_TASK_STATUS.STOPPED,
                type: 'unknown',
                user: 'unknown',
                starttime: 0,
                error: "Failed to check PVE task status"
            };
        }
    }

    // 重新整理並更新任務狀態
    private async _refreshAndUpdateTaskStatus(task: VM_Task): Promise<VM_Task_With_PVE_Status> {
        try {
            if (!task.steps || task.steps.length === 0 || !task.steps[0].pve_upid) {
                return await this._getTaskWithPVEStatus(task);
            }

            const pveStatus = await this._checkPVETaskStatus(task.target_node, task.steps[0].pve_upid);

            // 根據 PVE 狀態更新本地任務狀態
            if (pveStatus && !pveStatus.error) {
                let newStatus = task.status;
                let newProgress = task.progress;

                // 根據 PVE 狀態映射到本地狀態
                if (pveStatus.status === PVE_TASK_STATUS.RUNNING) {
                    newStatus = VM_Task_Status.IN_PROGRESS;
                    newProgress = pveStatus.progress || 0;
                } else if (pveStatus.status === PVE_TASK_STATUS.STOPPED) {
                    if (pveStatus.exitstatus === PVE_TASK_EXIT_STATUS.OK) {
                        newStatus = VM_Task_Status.COMPLETED;
                        newProgress = 100;
                    } else if (pveStatus.exitstatus === null) {
                        // 任務停止但沒有結果，保持當前狀態
                        newStatus = VM_Task_Status.IN_PROGRESS;
                    } else {
                        // exitstatus 是錯誤訊息字串
                        newStatus = VM_Task_Status.FAILED;
                    }
                }

                // 更新資料庫中的任務狀態
                if (newStatus !== task.status || newProgress !== task.progress) {
                    const updateData: VM_Task_Update = {
                        status: newStatus,
                        progress: newProgress,
                        updated_at: new Date(),
                        'steps.0.step_status': newStatus,
                        'steps.0.step_end_time': pveStatus.endtime ? new Date(pveStatus.endtime * 1000) : undefined
                    };

                    // 如果任務失敗，保存錯誤訊息
                    if (newStatus === VM_Task_Status.FAILED && pveStatus.exitstatus && pveStatus.exitstatus !== PVE_TASK_EXIT_STATUS.OK) {
                        updateData['steps.0.error_message'] = pveStatus.exitstatus;
                    }

                    await VM_TaskModel.updateOne({ task_id: task.task_id }, updateData);

                    // 更新本地物件
                    task.status = newStatus;
                    task.progress = newProgress;
                    task.updated_at = new Date();
                    if (task.steps && task.steps[0]) {
                        task.steps[0].step_status = newStatus;
                        if (pveStatus.endtime) {
                            task.steps[0].step_end_time = new Date(pveStatus.endtime * 1000);
                        }
                    }
                }
            }

            return await this._getTaskWithPVEStatus(task);
        } catch (error) {
            console.error(`Error refreshing task status for ${task.task_id}:`, error);
            return await this._getTaskWithPVEStatus(task);
        }
    }

    // 清理舊任務記錄
    private async _cleanupOldTasks(): Promise<void> {
        try {
            const maxTaskAge = 30; // 保留最近30天的任務
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - maxTaskAge);

            const result: DeleteResult = await VM_TaskModel.deleteMany({
                created_at: { $lt: cutoffDate }
            });

            console.log(`Cleaned up ${result.deletedCount} old tasks older than ${maxTaskAge} days`);
        } catch (error) {
            console.error("Error cleaning up old tasks:", error);
        }
    }

    // 定期清理任務 - 可以設置為定時任務
    public async cleanupTasks(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<User>(Request);
            if (error) {
                console.error("Error validating token:", error);
                return error;
            }

            console.log("Starting task cleanup...");
            await this._cleanupOldTasks();

            // 統計清理後的任務數量
            const totalTasks = await VM_TaskModel.countDocuments();
            const tasksByStatus = await VM_TaskModel.aggregate([
                {
                    $group: {
                        _id: "$status",
                        count: { $sum: 1 }
                    }
                }
            ]);

            return createResponse(200, "Task cleanup completed", {
                totalTasks,
                tasksByStatus
            });
        } catch (error) {
            console.error("Error in cleanupTasks:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // 為普通用戶獲取基本 QEMU 配置（只包含必要資訊）
    private async _getBasicQemuConfig(node: string, vmid: string): Promise<resp<VMBasicConfig | undefined>> {
        try {
            const qemuConfig: PVEResp = await callWithUnauthorized('GET', pve_api.nodes_qemu_config(node, vmid), undefined, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_USERMODE_TOKEN}`
                }
            });

            if (!qemuConfig || !qemuConfig.data) {
                return createResponse(404, "QEMU config not found");
            }

            // 只返回基本資訊：CPU、記憶體、磁碟
            const basicConfig: VMBasicConfig = {
                vmid: qemuConfig.data.vmid,
                name: qemuConfig.data.name,
                cores: qemuConfig.data.cores,
                memory: qemuConfig.data.memory,
                node: node,
                status: qemuConfig.data.status || 'stopped',
                // 只返回磁碟大小資訊，不包含詳細路徑
                disk_size: PVEUtils.extractDiskSize(qemuConfig.data)
            };

            return createResponse(200, "Basic QEMU config fetched successfully", basicConfig);
        } catch (error) {
            console.error("Error in _getBasicQemuConfig:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // 為管理員獲取詳細 QEMU 配置
    private async _getDetailedQemuConfig(node: string, vmid: string): Promise<resp<VMDetailedConfig | undefined>> {
        try {
            const qemuConfig: PVEResp = await callWithUnauthorized('GET', pve_api.nodes_qemu_config(node, vmid), undefined, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_ADMINMODE_TOKEN}`
                }
            });

            if (!qemuConfig || !qemuConfig.data) {
                return createResponse(404, "QEMU config not found");
            }

            // 返回詳細資訊但不包含敏感資訊
            const detailedConfig: VMDetailedConfig = {
                vmid: qemuConfig.data.vmid,
                name: qemuConfig.data.name,
                cores: qemuConfig.data.cores,
                memory: qemuConfig.data.memory,
                node: node,
                status: qemuConfig.data.status || 'stopped',
                scsi0: qemuConfig.data.scsi0,
                net0: qemuConfig.data.net0,
                bootdisk: qemuConfig.data.bootdisk,
                ostype: qemuConfig.data.ostype,
                disk_size: PVEUtils.extractDiskSize(qemuConfig.data)
            };

            return createResponse(200, "Detailed QEMU config fetched successfully", detailedConfig);
        } catch (error) {
            console.error("Error in _getDetailedQemuConfig:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // 為超級管理員獲取完整 QEMU 配置
    private async _getFullQemuConfig(node: string, vmid: string): Promise<resp<any>> {
        try {
            const qemuConfig: PVEResp = await callWithUnauthorized('GET', pve_api.nodes_qemu_config(node, vmid), undefined, {
                headers: {
                    'Authorization': `PVEAPIToken=${PVE_API_SUPERADMINMODE_TOKEN}`
                }
            });

            if (!qemuConfig || !qemuConfig.data) {
                return createResponse(404, "QEMU config not found");
            }

            // 返回完整配置
            return createResponse(200, "Full QEMU config fetched successfully", qemuConfig.data);
        } catch (error) {
            console.error("Error in _getFullQemuConfig:", error);
            return createResponse(500, "Internal Server Error");
        }
    }
}