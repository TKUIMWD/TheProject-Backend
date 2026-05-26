import { UsersModel } from "../../orm/schemas/UserSchemas";

type ExecQuery<T> = { exec(): Promise<T> };

type LeanableQuery<T> = {
    lean(): ExecQuery<T>;
    exec(): Promise<T>;
};

type UserModelAdapter = {
    find(query: unknown): LeanableQuery<any[]>;
    findById(id: string): LeanableQuery<any | null>;
    findByIdAndUpdate(id: string, update: unknown): ExecQuery<any | null>;
    updateMany(query: unknown, update: unknown): ExecQuery<any>;
};

const defaultUserModelAdapter: UserModelAdapter = {
    find: (query) => UsersModel.find(query as any),
    findById: (id) => UsersModel.findById(id),
    findByIdAndUpdate: (id, update) => UsersModel.findByIdAndUpdate(id, update as any),
    updateMany: (query, update) => UsersModel.updateMany(query as any, update as any)
};

export class UserRepository {
    constructor(private readonly userModel: UserModelAdapter = defaultUserModelAdapter) {}

    public async listByIds(userIds: string[], options: { lean?: boolean } = {}): Promise<any[]> {
        if (userIds.length === 0) return [];

        const query = this.userModel.find({ _id: { $in: userIds } });
        return options.lean ? query.lean().exec() : query.exec();
    }

    public async findById(userId: string, options: { lean?: boolean } = {}): Promise<any | null> {
        const query = this.userModel.findById(userId);
        return options.lean ? query.lean().exec() : query.exec();
    }

    public async listByEmails(emails: string[], options: { lean?: boolean } = {}): Promise<any[]> {
        if (emails.length === 0) return [];

        const query = this.userModel.find({ email: { $in: emails } });
        return options.lean ? query.lean().exec() : query.exec();
    }

    public async updateCourseIds(userId: string, courseIds: string[]): Promise<any | null> {
        return this.userModel.findByIdAndUpdate(userId, { course_ids: courseIds }).exec();
    }

    public async removeCourseFromAllUsers(courseId: string): Promise<any> {
        return this.userModel.updateMany(
            { course_ids: courseId },
            { $pull: { course_ids: courseId } }
        ).exec();
    }
}

export const userRepository = new UserRepository();
