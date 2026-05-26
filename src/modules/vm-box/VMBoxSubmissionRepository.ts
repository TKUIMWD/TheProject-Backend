import { UpdateResult } from "mongodb";
import { SubmittedBox, SubmittedBoxStatus } from "../../interfaces/SubmittedBox";
import { SubmittedBoxModel } from "../../orm/schemas/VM/SubmittedBoxSchemas";

type ExecQuery<T> = { exec(): Promise<T> };

type SortableQuery<T> = {
    sort(sort: unknown): ExecQuery<T>;
    exec(): Promise<T>;
};

type SubmittedBoxDocument = SubmittedBox & {
    _id?: unknown;
    save(): Promise<SubmittedBox>;
};

type SubmittedBoxModelAdapter = {
    createDocument(payload: unknown): SubmittedBoxDocument;
    find(query?: unknown): SortableQuery<SubmittedBox[]>;
    findById(id: string): ExecQuery<any | null>;
    updateOne(query: unknown, update: unknown): ExecQuery<UpdateResult>;
};

const defaultSubmittedBoxModelAdapter: SubmittedBoxModelAdapter = {
    createDocument: (payload) => new SubmittedBoxModel(payload),
    find: (query = {}) => SubmittedBoxModel.find(query as any),
    findById: (id) => SubmittedBoxModel.findById(id),
    updateOne: (query, update) => SubmittedBoxModel.updateOne(query as any, update as any)
};

export class VMBoxSubmissionRepository {
    constructor(private readonly submissionModel: SubmittedBoxModelAdapter = defaultSubmittedBoxModelAdapter) {}

    public createSubmissionDocument(payload: unknown): SubmittedBoxDocument {
        return this.submissionModel.createDocument(payload);
    }

    public async listAllNewestFirst(): Promise<SubmittedBox[]> {
        return this.submissionModel.find().sort({ submitted_date: -1 }).exec();
    }

    public async listByStatus(status: SubmittedBoxStatus): Promise<SubmittedBox[]> {
        return this.submissionModel.find({ status }).exec();
    }

    public async findById(submissionId: string): Promise<any | null> {
        return this.submissionModel.findById(submissionId).exec();
    }

    public async updateAiAssistantSetting(submissionId: string, allowAiAssistant: boolean, now: Date = new Date()): Promise<UpdateResult> {
        return this.submissionModel.updateOne(
            { _id: submissionId },
            { $set: { allow_ai_assistant: allowAiAssistant, status_updated_date: now } }
        ).exec();
    }
}

export const vmBoxSubmissionRepository = new VMBoxSubmissionRepository();
