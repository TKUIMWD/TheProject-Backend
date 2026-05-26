import { DeleteResult, UpdateResult } from "mongodb";
import { VM_Task, VM_Task_Query } from "../../interfaces/VM/VM_Task";
import { VM_TaskModel } from "../../orm/schemas/VM/VM_TaskSchemas";

type ExecQuery<T> = { exec(): Promise<T> };

type SortableTaskQuery<T> = {
    sort(sort: unknown): SortableTaskQuery<T>;
    skip(skip: number): SortableTaskQuery<T>;
    limit(limit: number): ExecQuery<T>;
    exec(): Promise<T>;
};

type VMTaskModelAdapter = {
    create(task: VM_Task): Promise<unknown>;
    updateByTaskId(taskId: string, update: unknown): Promise<UpdateResult>;
    findUserTaskRefsNewestFirst(userId: string): Promise<Array<{ task_id?: unknown }>>;
    deleteByTaskIds(taskIds: string[]): Promise<DeleteResult>;
    find(query: unknown): SortableTaskQuery<any[]>;
    findOne(query: unknown): SortableTaskQuery<any | null>;
    countDocuments(query?: unknown): Promise<number>;
    deleteMany(query: unknown): Promise<DeleteResult>;
    aggregate(pipeline: unknown[]): Promise<any[]>;
};

const defaultVMTaskModelAdapter: VMTaskModelAdapter = {
    create: (task) => VM_TaskModel.create(task),
    updateByTaskId: (taskId, update) => VM_TaskModel.updateOne({ task_id: taskId }, update as any).exec(),
    findUserTaskRefsNewestFirst: (userId) => VM_TaskModel.find({ user_id: userId })
        .sort({ created_at: -1 })
        .select("task_id")
        .lean()
        .exec(),
    deleteByTaskIds: (taskIds) => VM_TaskModel.deleteMany({ task_id: { $in: taskIds } }).exec(),
    find: (query) => VM_TaskModel.find(query as any),
    findOne: (query) => VM_TaskModel.findOne(query as any),
    countDocuments: (query = {}) => VM_TaskModel.countDocuments(query as any).exec(),
    deleteMany: (query) => VM_TaskModel.deleteMany(query as any).exec(),
    aggregate: (pipeline) => VM_TaskModel.aggregate(pipeline as any).exec()
};

export class VMTaskRepository {
    constructor(private readonly taskModel: VMTaskModelAdapter = defaultVMTaskModelAdapter) {}

    public async createTask(task: VM_Task): Promise<void> {
        await this.taskModel.create(task);
    }

    public async updateTask(taskId: string, update: unknown): Promise<UpdateResult> {
        return this.taskModel.updateByTaskId(taskId, update);
    }

    public async listUserTaskRefsNewestFirst(userId: string): Promise<Array<{ task_id?: unknown }>> {
        return this.taskModel.findUserTaskRefsNewestFirst(userId);
    }

    public async deleteTasksByIds(taskIds: string[]): Promise<DeleteResult> {
        return this.taskModel.deleteByTaskIds(taskIds);
    }

    public async listTasksByIdsForUser(taskIds: string[], userId: string): Promise<any[]> {
        if (taskIds.length === 0) return [];
        return this.taskModel.find({
            task_id: { $in: taskIds },
            user_id: userId
        }).exec();
    }

    public async findLatestForUser(userId: string): Promise<any | null> {
        return this.taskModel.findOne({ user_id: userId })
            .sort({ created_at: -1 })
            .exec();
    }

    public async listForUser(query: VM_Task_Query, pagination: { skip: number; limit: number }): Promise<any[]> {
        return this.taskModel.find(query)
            .sort({ created_at: -1 })
            .skip(pagination.skip)
            .limit(pagination.limit)
            .exec();
    }

    public async count(query: unknown = {}): Promise<number> {
        return this.taskModel.countDocuments(query);
    }

    public async findByTaskIdForUser(taskId: string, userId: string): Promise<any | null> {
        return this.taskModel.findOne({
            task_id: taskId,
            user_id: userId
        }).exec();
    }

    public async deleteOlderThan(cutoffDate: Date): Promise<DeleteResult> {
        return this.taskModel.deleteMany({
            created_at: { $lt: cutoffDate }
        });
    }

    public async countByStatus(): Promise<Array<{ _id: string; count: number }>> {
        return this.taskModel.aggregate([
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 }
                }
            }
        ]);
    }
}

export const vmTaskRepository = new VMTaskRepository();
