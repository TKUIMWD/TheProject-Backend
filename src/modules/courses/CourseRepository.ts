import { CourseModel } from "../../orm/schemas/CourseSchemas";

type ExecQuery<T> = { exec(): Promise<T> };

type LeanableQuery<T> = {
    lean(): ExecQuery<T>;
    exec(): Promise<T>;
};

type CourseModelAdapter = {
    createDocument(payload: unknown): any;
    find(query?: unknown): LeanableQuery<any[]>;
    findById(id: string): LeanableQuery<any | null>;
    findOne(query: unknown): ExecQuery<any | null>;
    findByIdAndUpdate(id: string, update: unknown, options?: unknown): ExecQuery<any | null>;
    findByIdAndDelete(id: unknown): ExecQuery<any | null>;
};

const defaultCourseModelAdapter: CourseModelAdapter = {
    createDocument: (payload) => new CourseModel(payload),
    find: (query = {}) => CourseModel.find(query as any),
    findById: (id) => CourseModel.findById(id),
    findOne: (query) => CourseModel.findOne(query as any),
    findByIdAndUpdate: (id, update, options) => CourseModel.findByIdAndUpdate(id, update as any, options as any),
    findByIdAndDelete: (id) => CourseModel.findByIdAndDelete(id as any)
};

export class CourseRepository {
    constructor(private readonly courseModel: CourseModelAdapter = defaultCourseModelAdapter) {}

    public createCourseDocument(payload: unknown): any {
        return this.courseModel.createDocument(payload);
    }

    public async findById(courseId: string, options: { lean?: boolean } = {}): Promise<any | null> {
        const query = this.courseModel.findById(courseId);
        return options.lean ? query.lean().exec() : query.exec();
    }

    public async findByName(courseName: string): Promise<any | null> {
        return this.courseModel.findOne({ course_name: courseName }).exec();
    }

    public async updateById(courseId: string, update: unknown, options?: unknown): Promise<any | null> {
        return this.courseModel.findByIdAndUpdate(courseId, update, options).exec();
    }

    public async deleteById(courseId: unknown): Promise<any | null> {
        return this.courseModel.findByIdAndDelete(courseId).exec();
    }

    public async listAll(options: { lean?: boolean } = {}): Promise<any[]> {
        const query = this.courseModel.find();
        return options.lean ? query.lean().exec() : query.exec();
    }

    public async listByStatus(status: string, options: { lean?: boolean } = {}): Promise<any[]> {
        const query = this.courseModel.find({ status });
        return options.lean ? query.lean().exec() : query.exec();
    }
}

export const courseRepository = new CourseRepository();
