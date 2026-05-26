import { DeleteResult, UpdateResult } from "mongodb";
import { AIBoxBuildJob } from "../../interfaces/AIBoxBuildJob";
import { AIBoxBuildJobModel } from "../../orm/schemas/AIBoxBuildJobSchemas";

type ExecQuery<T> = { exec(): Promise<T> };

type SortableLimitQuery<T> = {
    sort(sort: unknown): SortableLimitQuery<T>;
    limit(limit: number): ExecQuery<T>;
    exec(): Promise<T>;
};

type AIBoxBuildJobModelAdapter = {
    create(payload: unknown): Promise<any>;
    find(query: unknown): SortableLimitQuery<any[]>;
    findById(id: string): ExecQuery<any | null>;
    deleteOne(query: unknown): ExecQuery<DeleteResult>;
    updateOne(query: unknown, update: unknown): ExecQuery<UpdateResult>;
    updateMany(query: unknown, update: unknown): ExecQuery<UpdateResult>;
    findOneAndUpdate(query: unknown, update: unknown, options: unknown): ExecQuery<any | null>;
};

const defaultAIBoxBuildJobModelAdapter: AIBoxBuildJobModelAdapter = {
    create: (payload) => AIBoxBuildJobModel.create(payload as any),
    find: (query) => AIBoxBuildJobModel.find(query as any),
    findById: (id) => AIBoxBuildJobModel.findById(id),
    deleteOne: (query) => AIBoxBuildJobModel.deleteOne(query as any),
    updateOne: (query, update) => AIBoxBuildJobModel.updateOne(query as any, update as any),
    updateMany: (query, update) => AIBoxBuildJobModel.updateMany(query as any, update as any),
    findOneAndUpdate: (query, update, options) => AIBoxBuildJobModel.findOneAndUpdate(query as any, update as any, options as any)
};

export class AIBoxBuildJobRepository {
    constructor(private readonly jobModel: AIBoxBuildJobModelAdapter = defaultAIBoxBuildJobModelAdapter) {}

    public async createJob(payload: unknown): Promise<any> {
        return this.jobModel.create(payload);
    }

    public async listRecentJobs(query: unknown, limit: number = 50): Promise<any[]> {
        return this.jobModel.find(query).sort({ updated_at: -1 }).limit(limit).exec();
    }

    public async findById(jobId: string): Promise<any | null> {
        return this.jobModel.findById(jobId).exec();
    }

    public async deleteById(jobId: string): Promise<DeleteResult> {
        return this.jobModel.deleteOne({ _id: jobId }).exec();
    }

    public async updateById(jobId: string, update: unknown): Promise<UpdateResult> {
        return this.jobModel.updateOne({ _id: jobId }, update).exec();
    }

    public async findLimited(query: unknown, limit: number): Promise<any[]> {
        return this.jobModel.find(query).limit(limit).exec();
    }

    public async updateMany(query: unknown, update: unknown): Promise<UpdateResult> {
        return this.jobModel.updateMany(query, update).exec();
    }

    public async findOneAndUpdate(query: unknown, update: unknown, options: unknown): Promise<any | null> {
        return this.jobModel.findOneAndUpdate(query, update, options).exec();
    }
}

export const aiBoxBuildJobRepository = new AIBoxBuildJobRepository();
