import { BoxWriteupStatus } from "../../interfaces/BoxWriteup";
import { BoxWriteupModel } from "../../orm/schemas/VM/BoxWriteupSchemas";

type ExecQuery<T> = { exec(): Promise<T> };

type SortableQuery<T> = {
    sort(sort: unknown): ExecQuery<T>;
    exec(): Promise<T>;
};

type BoxWriteupModelAdapter = {
    createDocument(payload: unknown): any;
    find(query: unknown): SortableQuery<any[]>;
    findOne(query: unknown): ExecQuery<any | null>;
    findById(id: string): ExecQuery<any | null>;
    aggregate(pipeline: unknown[]): ExecQuery<any[]>;
};

const defaultBoxWriteupModelAdapter: BoxWriteupModelAdapter = {
    createDocument: (payload) => new BoxWriteupModel(payload),
    find: (query) => BoxWriteupModel.find(query as any),
    findOne: (query) => BoxWriteupModel.findOne(query as any),
    findById: (id) => BoxWriteupModel.findById(id),
    aggregate: (pipeline) => BoxWriteupModel.aggregate(pipeline as any)
};

export class VMBoxWriteupRepository {
    constructor(private readonly writeupModel: BoxWriteupModelAdapter = defaultBoxWriteupModelAdapter) {}

    public createWriteupDocument(payload: unknown): any {
        return this.writeupModel.createDocument(payload);
    }

    public async findActiveByAuthorAndBox(boxId: string, authorUserId: string): Promise<any | null> {
        return this.writeupModel.findOne({
            box_id: boxId,
            author_user_id: authorUserId,
            status: { $in: [BoxWriteupStatus.pending, BoxWriteupStatus.approved] }
        }).exec();
    }

    public async listPublicApprovedByBox(boxId: string): Promise<any[]> {
        return this.writeupModel.find({
            box_id: boxId,
            status: BoxWriteupStatus.approved,
            is_public: true
        }).sort({ reviewed_date: -1, submitted_date: -1 }).exec();
    }

    public async listNewestByFilter(filter: unknown): Promise<any[]> {
        return this.writeupModel.find(filter).sort({ submitted_date: -1 }).exec();
    }

    public async findById(writeupId: string): Promise<any | null> {
        return this.writeupModel.findById(writeupId).exec();
    }

    public async listPublicWriteupCounts(boxIds: string[]): Promise<any[]> {
        if (boxIds.length === 0) return [];

        return this.writeupModel.aggregate([
            {
                $match: {
                    box_id: { $in: boxIds },
                    status: BoxWriteupStatus.approved,
                    is_public: true
                }
            },
            { $group: { _id: "$box_id", count: { $sum: 1 } } }
        ]).exec();
    }
}

export const vmBoxWriteupRepository = new VMBoxWriteupRepository();
