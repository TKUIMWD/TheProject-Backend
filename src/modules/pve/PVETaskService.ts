import { DeleteResult } from "mongodb";
import { pve_api } from "../../enum/PVE_API";
import { PVE_TASK_STATUS, PVE_Task_Status_Response } from "../../interfaces/PVE";
import { PVEResp } from "../../interfaces/Response/PVEResp";
import { User } from "../../interfaces/User";
import { VM_Task, VM_Task_Query, VM_Task_Status, VM_Task_With_PVE_Status } from "../../interfaces/VM/VM_Task";
import { logger } from "../../middlewares/log";
import { createResponse, resp } from "../../utils/resp";
import { validatePaginationInput } from "../common/PaginationPolicy";
import { PVEClient, pveClient } from "./PVEClient";
import { buildVMTaskPVERefreshDecision, buildVMTaskWithPVEStatusDTO } from "../vm/VMTaskFactory";
import { vmTaskRepository } from "../vm/VMTaskRepository";

type VMTaskServiceRepository = {
    listTasksByIdsForUser(taskIds: string[], userId: string): Promise<VM_Task[]>;
    findLatestForUser(userId: string): Promise<VM_Task | null>;
    listForUser(query: VM_Task_Query, pagination: { skip: number; limit: number }): Promise<VM_Task[]>;
    count(query?: unknown): Promise<number>;
    findByTaskIdForUser(taskId: string, userId: string): Promise<VM_Task | null>;
    updateTask(taskId: string, update: unknown): Promise<unknown>;
    deleteOlderThan(cutoffDate: Date): Promise<DeleteResult>;
    countByStatus(): Promise<Array<{ _id: string; count: number }>>;
};

type PVETaskServiceDeps = {
    taskRepo?: VMTaskServiceRepository;
    pve?: Pick<PVEClient, "request">;
    now?: () => Date;
};

export class PVETaskService {
    private readonly taskRepo: VMTaskServiceRepository;
    private readonly pve: Pick<PVEClient, "request">;
    private readonly now: () => Date;

    constructor(deps: PVETaskServiceDeps = {}) {
        this.taskRepo = deps.taskRepo ?? vmTaskRepository;
        this.pve = deps.pve ?? pveClient;
        this.now = deps.now ?? (() => new Date());
    }

    public async getMultipleTasksStatus(input: {
        user: User;
        taskIds: unknown;
    }): Promise<resp<any>> {
        if (!input.taskIds || !Array.isArray(input.taskIds) || input.taskIds.length === 0) {
            return createResponse(400, "task_ids must be a non-empty array");
        }

        const tasks = await this.taskRepo.listTasksByIdsForUser(input.taskIds, input.user._id!.toString());
        if (tasks.length === 0) {
            return createResponse(200, "No tasks found for the provided task IDs", []);
        }

        const tasksWithStatus = await Promise.all(tasks.map((task) => this.getTaskWithPVEStatus(task)));
        return createResponse(200, "Multiple tasks status fetched successfully", tasksWithStatus);
    }

    public async getUserLatestTaskStatus(user: User): Promise<resp<any>> {
        const latestTask = await this.taskRepo.findLatestForUser(user._id!.toString());
        if (!latestTask) {
            return createResponse(404, "No tasks found for the user");
        }

        const taskWithStatus = await this.getTaskWithPVEStatus(latestTask);
        return createResponse(200, "Latest task status fetched successfully", taskWithStatus);
    }

    public async getUserAllTasksStatus(input: {
        user: User;
        page?: unknown;
        limit?: unknown;
        status?: unknown;
    }): Promise<resp<any>> {
        const pagination = validatePaginationInput({
            page: input.page,
            limit: input.limit
        });
        if (!pagination.valid) {
            return createResponse(400, pagination.message);
        }

        const status = typeof input.status === "string" ? input.status : undefined;
        if (status && !Object.values(VM_Task_Status).includes(status as VM_Task_Status)) {
            return createResponse(400, "Invalid task status");
        }

        const query: VM_Task_Query = { user_id: input.user._id!.toString() };
        if (status) {
            query.status = status as VM_Task_Status;
        }

        const [tasks, totalTasks] = await Promise.all([
            this.taskRepo.listForUser(query, { skip: pagination.skip, limit: pagination.limit }),
            this.taskRepo.count(query)
        ]);

        const paginationBody = {
            page: pagination.page,
            limit: pagination.limit,
            total: totalTasks,
            totalPages: Math.ceil(totalTasks / pagination.limit)
        };

        if (tasks.length === 0) {
            return createResponse(200, "No tasks found", {
                tasks: [],
                pagination: paginationBody
            });
        }

        const tasksWithStatus = await Promise.all(tasks.map((task) => this.getTaskWithPVEStatus(task)));
        return createResponse(200, "User tasks status fetched successfully", {
            tasks: tasksWithStatus,
            pagination: paginationBody
        });
    }

    public async refreshTaskStatus(input: {
        user: User;
        taskId: unknown;
    }): Promise<resp<any>> {
        if (!input.taskId) {
            return createResponse(400, "task_id is required");
        }

        const task = await this.taskRepo.findByTaskIdForUser(String(input.taskId), input.user._id!.toString());
        if (!task) {
            return createResponse(404, "Task not found or access denied");
        }

        const refreshedTask = await this.refreshAndUpdateTaskStatus(task);
        return createResponse(200, "Task status refreshed successfully", refreshedTask);
    }

    public async cleanupTasks(): Promise<resp<any>> {
        logger.info("Starting task cleanup...");
        await this.cleanupOldTasks();

        const [totalTasks, tasksByStatus] = await Promise.all([
            this.taskRepo.count(),
            this.taskRepo.countByStatus()
        ]);

        return createResponse(200, "Task cleanup completed", {
            totalTasks,
            tasksByStatus
        });
    }

    private async getTaskWithPVEStatus(task: VM_Task): Promise<VM_Task_With_PVE_Status> {
        try {
            if (task.steps && task.steps.length > 0 && task.steps[0].pve_upid) {
                const pveStatus = await this.checkPVETaskStatus(task.target_node, task.steps[0].pve_upid);
                return buildVMTaskWithPVEStatusDTO(task, pveStatus);
            }

            return buildVMTaskWithPVEStatusDTO(task);
        } catch (error) {
            logger.error(`Error getting task with PVE status for ${task.task_id}:`, error);
            return buildVMTaskWithPVEStatusDTO(task);
        }
    }

    private async checkPVETaskStatus(node: string, upid: string): Promise<PVE_Task_Status_Response> {
        try {
            const statusResp: PVEResp = await this.pve.request('GET', pve_api.nodes_tasks_status(node, upid));
            logger.debug(`Checked PVE task status for UPID ${upid} on node ${node}`);

            if (statusResp && statusResp.data) {
                return {
                    upid,
                    node,
                    status: statusResp.data.status,
                    type: statusResp.data.type,
                    user: statusResp.data.user,
                    starttime: statusResp.data.starttime,
                    endtime: statusResp.data.endtime,
                    exitstatus: statusResp.data.exitstatus,
                    progress: statusResp.data.progress || 0
                };
            }

            return this.buildStoppedPVEStatus(node, upid, "No PVE task data found");
        } catch (error) {
            logger.error(`Error checking PVE task status for ${upid}:`, error);

            if (error instanceof SyntaxError && error.message.includes('JSON')) {
                logger.error(`JSON parsing error for task ${upid}:`, error.message);
                return this.buildStoppedPVEStatus(node, upid, `JSON parsing error: ${error.message}`);
            }

            return this.buildStoppedPVEStatus(node, upid, "Failed to check PVE task status");
        }
    }

    private async refreshAndUpdateTaskStatus(task: VM_Task): Promise<VM_Task_With_PVE_Status> {
        try {
            if (!task.steps || task.steps.length === 0 || !task.steps[0].pve_upid) {
                return await this.getTaskWithPVEStatus(task);
            }

            const pveStatus = await this.checkPVETaskStatus(task.target_node, task.steps[0].pve_upid);
            const refreshDecision = buildVMTaskPVERefreshDecision(task, pveStatus, this.now());
            if (refreshDecision.shouldUpdate) {
                await this.taskRepo.updateTask(task.task_id, refreshDecision.updateData);

                task.status = refreshDecision.status;
                task.progress = refreshDecision.progress;
                task.updated_at = refreshDecision.updateData.updated_at as Date;
                if (task.steps && task.steps[0]) {
                    task.steps[0].step_status = refreshDecision.status;
                    if (refreshDecision.updateData["steps.0.step_end_time"]) {
                        task.steps[0].step_end_time = refreshDecision.updateData["steps.0.step_end_time"] as Date;
                    }
                }
            }

            return await this.getTaskWithPVEStatus(task);
        } catch (error) {
            logger.error(`Error refreshing task status for ${task.task_id}:`, error);
            return await this.getTaskWithPVEStatus(task);
        }
    }

    private async cleanupOldTasks(): Promise<void> {
        try {
            const maxTaskAge = 30;
            const cutoffDate = this.now();
            cutoffDate.setDate(cutoffDate.getDate() - maxTaskAge);

            const result = await this.taskRepo.deleteOlderThan(cutoffDate);
            logger.info(`Cleaned up ${result.deletedCount} old tasks older than ${maxTaskAge} days`);
        } catch (error) {
            logger.error("Error cleaning up old tasks:", error);
        }
    }

    private buildStoppedPVEStatus(node: string, upid: string, error: string): PVE_Task_Status_Response {
        return {
            upid,
            node,
            status: PVE_TASK_STATUS.STOPPED,
            type: 'unknown',
            user: 'unknown',
            starttime: 0,
            error
        };
    }
}

export const pveTaskService = new PVETaskService();
