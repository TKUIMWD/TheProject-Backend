import { ChapterModel } from "../../orm/schemas/ChapterSchemas";

type ExecQuery<T> = { exec(): Promise<T> };

type LeanableQuery<T> = {
    lean(): ExecQuery<T>;
    exec(): Promise<T>;
};

type ChapterModelAdapter = {
    find(query: unknown): LeanableQuery<any[]>;
    deleteMany(query: unknown): ExecQuery<any>;
    updateMany(query: unknown, update: unknown): ExecQuery<any>;
};

const defaultChapterModelAdapter: ChapterModelAdapter = {
    find: (query) => ChapterModel.find(query as any),
    deleteMany: (query) => ChapterModel.deleteMany(query as any),
    updateMany: (query, update) => ChapterModel.updateMany(query as any, update as any)
};

export class CourseChapterRepository {
    constructor(private readonly chapterModel: ChapterModelAdapter = defaultChapterModelAdapter) {}

    public async listByIds(chapterIds: string[], options: { lean?: boolean } = {}): Promise<any[]> {
        if (chapterIds.length === 0) return [];

        const query = this.chapterModel.find({ _id: { $in: chapterIds } });
        return options.lean ? query.lean().exec() : query.exec();
    }

    public async deleteByIds(chapterIds: string[]): Promise<any> {
        if (chapterIds.length === 0) return { deletedCount: 0 };

        return this.chapterModel.deleteMany({ _id: { $in: chapterIds } }).exec();
    }

    public async syncApprovedContentByIds(chapterIds: string[]): Promise<any> {
        if (chapterIds.length === 0) return { modifiedCount: 0 };

        return this.chapterModel.updateMany(
            { _id: { $in: chapterIds } },
            [
                { $set: { has_approved_content: "$waiting_for_approve_content" } }
            ]
        ).exec();
    }
}

export const courseChapterRepository = new CourseChapterRepository();
