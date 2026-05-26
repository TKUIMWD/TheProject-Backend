import Roles from "../../enum/role";
import { ChapterPageDTO } from "../../interfaces/Chapter/ChapterPageDTO";
import { User } from "../../interfaces/User";
import { ChapterModel } from "../../orm/schemas/ChapterSchemas";
import { ClassModel } from "../../orm/schemas/ClassSchemas";
import { CourseModel } from "../../orm/schemas/CourseSchemas";
import { createResponse, resp } from "../../utils/resp";
import { validateObjectIdInput } from "../common/ObjectIdPolicy";
import {
    validateChapterCreateInput,
    validateChapterUpdateInput
} from "./ChapterContentPolicy";

type ChapterManagementChapterRepo = {
    findById(chapterId: string, options?: { lean?: boolean }): Promise<any | null>;
    findOneLean(query: unknown): Promise<any | null>;
    listLean(query: unknown): Promise<any[]>;
    create(payload: Record<string, unknown>): Promise<any>;
    updateById(chapterId: string, update: Record<string, unknown>): Promise<unknown>;
    deleteById(chapterId: string): Promise<unknown>;
};

type ChapterManagementClassRepo = {
    findById(classId: string, options?: { lean?: boolean }): Promise<any | null>;
    pushChapterId(classId: string, chapterId: unknown): Promise<unknown>;
    pullChapterId(classId: string, chapterId: string): Promise<unknown>;
};

type ChapterManagementCourseRepo = {
    findById(courseId: string, options?: { lean?: boolean }): Promise<any | null>;
};

type ChapterManagementServiceDeps = {
    chapterRepo?: ChapterManagementChapterRepo;
    classRepo?: ChapterManagementClassRepo;
    courseRepo?: ChapterManagementCourseRepo;
};

const defaultChapterRepo: ChapterManagementChapterRepo = {
    findById: (chapterId, options = {}) => {
        const query = ChapterModel.findById(chapterId);
        return options.lean ? query.lean().exec() : query.exec();
    },
    findOneLean: (query) => ChapterModel.findOne(query as any).lean().exec(),
    listLean: (query) => ChapterModel.find(query as any).lean().exec(),
    create: async (payload) => {
        const chapter = new ChapterModel(payload);
        return chapter.save();
    },
    updateById: (chapterId, update) => ChapterModel.findByIdAndUpdate(chapterId, update).exec(),
    deleteById: (chapterId) => ChapterModel.findByIdAndDelete(chapterId).exec()
};

const defaultClassRepo: ChapterManagementClassRepo = {
    findById: (classId, options = {}) => {
        const query = ClassModel.findById(classId);
        return options.lean ? query.lean().exec() : query.exec();
    },
    pushChapterId: (classId, chapterId) => ClassModel.findByIdAndUpdate(classId, {
        $push: { chapter_ids: chapterId }
    }).exec(),
    pullChapterId: (classId, chapterId) => ClassModel.findByIdAndUpdate(classId, {
        $pull: { chapter_ids: chapterId }
    }).exec()
};

const defaultCourseRepo: ChapterManagementCourseRepo = {
    findById: (courseId, options = {}) => {
        const query = CourseModel.findById(courseId);
        return options.lean ? query.lean().exec() : query.exec();
    }
};

export class ChapterManagementService {
    private readonly chapterRepo: ChapterManagementChapterRepo;
    private readonly classRepo: ChapterManagementClassRepo;
    private readonly courseRepo: ChapterManagementCourseRepo;

    constructor(deps: ChapterManagementServiceDeps = {}) {
        this.chapterRepo = deps.chapterRepo ?? defaultChapterRepo;
        this.classRepo = deps.classRepo ?? defaultClassRepo;
        this.courseRepo = deps.courseRepo ?? defaultCourseRepo;
    }

    public async getChapterById(input: {
        user: User;
        chapterId: unknown;
    }): Promise<resp<ChapterPageDTO | undefined>> {
        const chapterIdResult = validateObjectIdInput(input.chapterId, "chapter_id");
        if (!chapterIdResult.valid) {
            return createResponse(400, "Invalid chapter_id format");
        }

        const chapter = await this.chapterRepo.findById(chapterIdResult.value, { lean: true });
        if (!chapter) {
            return createResponse(404, "Chapter not found");
        }

        const parentClass = await this.classRepo.findById(chapter.class_id, { lean: true });
        if (!parentClass) {
            return createResponse(404, "Could not find parent class for this chapter");
        }

        const parentCourse = await this.courseRepo.findById(chapter.course_id, { lean: true });
        if (!parentCourse) {
            return createResponse(404, "Could not find parent course for this chapter");
        }

        const isJoined = input.user.course_ids && input.user.course_ids.includes(parentCourse._id.toString());
        const isSuperAdmin = input.user.role === Roles.SuperAdmin;
        if (!isJoined && !isSuperAdmin) {
            return createResponse(403, "You are not authorized to view this chapter.");
        }

        const chapterData: ChapterPageDTO = {
            course_id: parentCourse._id,
            course_name: parentCourse.course_name,
            class_id: parentClass._id,
            class_name: parentClass.class_name,
            chapter_id: chapter._id,
            chapter_name: chapter.chapter_name,
            chapter_subtitle: chapter.chapter_subtitle,
            chapter_order: chapter.chapter_order,
            has_approved_content: chapter.has_approved_content,
            waiting_for_approve_content: chapter.waiting_for_approve_content,
            saved_content: chapter.saved_content,
            template_id: chapter.template_id
        };

        return createResponse(200, "Chapter data retrieved successfully", chapterData);
    }

    public async deleteChapterById(input: {
        user: User;
        chapterId: unknown;
    }): Promise<resp<string | undefined>> {
        const chapterIdResult = validateObjectIdInput(input.chapterId, "chapter_id");
        if (!chapterIdResult.valid) {
            return createResponse(400, "Invalid chapter_id format");
        }
        const chapterId = chapterIdResult.value;

        const chapter = await this.chapterRepo.findById(chapterId);
        if (!chapter) {
            return createResponse(404, "Chapter not found");
        }

        const course = await this.courseRepo.findById(chapter.course_id);
        if (!course || !this.isCourseOwner(input.user, course)) {
            return createResponse(403, "You are not authorized to delete this chapter");
        }

        await this.classRepo.pullChapterId(chapter.class_id, chapterId);
        await this.chapterRepo.deleteById(chapterId);

        return createResponse(200, "Chapter deleted successfully");
    }

    public async updateChapterById(input: {
        user: User;
        chapterId: unknown;
        body: Record<string, unknown>;
    }): Promise<resp<string | undefined>> {
        const chapterIdResult = validateObjectIdInput(input.chapterId, "chapter_id");
        if (!chapterIdResult.valid) {
            return createResponse(400, "Invalid chapter_id format");
        }
        const chapterId = chapterIdResult.value;

        const chapter = await this.chapterRepo.findById(chapterId);
        if (!chapter) {
            return createResponse(404, "Chapter not found");
        }

        const course = await this.courseRepo.findById(chapter.course_id);
        if (!course || !this.isCourseOwner(input.user, course)) {
            return createResponse(403, "You are not authorized to update this chapter");
        }

        const updatePolicy = validateChapterUpdateInput(input.body);
        if (!updatePolicy.valid) {
            return createResponse(400, updatePolicy.message);
        }
        const updateData: Record<string, unknown> = { ...updatePolicy.updates };

        if (updateData.chapter_name !== undefined && updateData.chapter_name !== chapter.chapter_name) {
            const existingChapter = await this.chapterRepo.findOneLean({
                class_id: chapter.class_id,
                chapter_name: updateData.chapter_name,
                _id: { $ne: chapterId }
            });
            if (existingChapter) {
                return createResponse(409, "A chapter with this name already exists in this class.");
            }
        }

        if (updateData.chapter_order !== undefined) {
            const existingChapters = await this.chapterRepo.listLean({
                class_id: chapter.class_id,
                chapter_order: updateData.chapter_order,
                _id: { $ne: chapterId }
            });
            if (existingChapters.length > 0) {
                return createResponse(400, "A chapter with the same order already exists in this class.");
            }
        }

        await this.chapterRepo.updateById(chapterId, { $set: updateData });
        return createResponse(200, "Chapter updated successfully");
    }

    public async addChapterToClass(input: {
        user: User;
        classId: unknown;
        body: Record<string, unknown>;
    }): Promise<resp<String | { chapter_id: string } | undefined>> {
        const classIdResult = validateObjectIdInput(input.classId, "class_id");
        if (!classIdResult.valid) {
            return createResponse(400, "Invalid class_id format");
        }
        const classId = classIdResult.value;

        const classData = await this.classRepo.findById(classId, { lean: true });
        if (!classData) {
            return createResponse(404, "Class not found");
        }

        const createPolicy = validateChapterCreateInput({
            ...input.body,
            template_id: input.body.template_id ?? ""
        });
        if (!createPolicy.valid) {
            return createResponse(400, createPolicy.message);
        }

        const course = await this.courseRepo.findById(classData.course_id, { lean: true });
        if (!course) {
            return createResponse(404, "Course not found");
        }

        if (!this.isCourseOwner(input.user, course)) {
            return createResponse(403, "You are not authorized to add classes to this course");
        }

        const existingChapter = await this.chapterRepo.findOneLean({
            class_id: classId,
            chapter_name: createPolicy.fields.chapter_name
        });
        if (existingChapter) {
            return createResponse(400, "Chapter with this name already exists in the class");
        }

        const savedChapter = await this.chapterRepo.create({
            chapter_name: createPolicy.fields.chapter_name,
            chapter_subtitle: createPolicy.fields.chapter_subtitle,
            chapter_order: createPolicy.fields.chapter_order,
            class_id: classId,
            course_id: classData.course_id,
            has_approved_content: "",
            waiting_for_approve_content: createPolicy.fields.chapter_content,
            saved_content: "",
            template_id: createPolicy.fields.template_id
        });

        await this.classRepo.pushChapterId(classId, savedChapter._id);
        return createResponse(200, "Chapter added successfully", { chapter_id: String(savedChapter._id) });
    }

    private isCourseOwner(user: User, course: any): boolean {
        return user._id!.toString() === course.submitter_user_id.toString();
    }
}

export const chapterManagementService = new ChapterManagementService();
