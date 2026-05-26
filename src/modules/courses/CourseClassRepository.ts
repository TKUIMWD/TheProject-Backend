import { ClassModel } from "../../orm/schemas/ClassSchemas";

type ExecQuery<T> = { exec(): Promise<T> };

type LeanableQuery<T> = {
    lean(): ExecQuery<T>;
    exec(): Promise<T>;
};

type SelectableLeanableQuery<T> = LeanableQuery<T> & {
    select(fields: string): LeanableQuery<T>;
};

type ClassModelAdapter = {
    find(query: unknown): SelectableLeanableQuery<any[]>;
    deleteMany(query: unknown): ExecQuery<any>;
};

const defaultClassModelAdapter: ClassModelAdapter = {
    find: (query) => ClassModel.find(query as any),
    deleteMany: (query) => ClassModel.deleteMany(query as any)
};

export class CourseClassRepository {
    constructor(private readonly classModel: ClassModelAdapter = defaultClassModelAdapter) {}

    public async listByIds(classIds: string[], options: { lean?: boolean } = {}): Promise<any[]> {
        if (classIds.length === 0) return [];

        const query = this.classModel.find({ _id: { $in: classIds } });
        return options.lean ? query.lean().exec() : query.exec();
    }

    public async listChapterRefsByIds(classIds: string[]): Promise<any[]> {
        if (classIds.length === 0) return [];

        return this.classModel.find({ _id: { $in: classIds } }).select("chapter_ids").lean().exec();
    }

    public async deleteByIds(classIds: string[]): Promise<any> {
        if (classIds.length === 0) return { deletedCount: 0 };

        return this.classModel.deleteMany({ _id: { $in: classIds } }).exec();
    }
}

export const courseClassRepository = new CourseClassRepository();
