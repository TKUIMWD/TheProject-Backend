import { ClassModel } from "../../orm/schemas/ClassSchemas";
import { CourseModel } from "../../orm/schemas/CourseSchemas";
import { ChapterModel } from "../../orm/schemas/ChapterSchemas";
import { User } from "../../interfaces/User";
import { createResponse, resp } from "../../utils/resp";
import { validateObjectIdInput } from "../common/ObjectIdPolicy";
import {
    validateClassCreateInput,
    validateClassUpdateInput
} from "./ClassContentPolicy";

type ClassManagementClassRepo = {
    findById(classId: string): Promise<any | null>;
    findOneLean(query: unknown): Promise<any | null>;
    listLean(query: unknown): Promise<any[]>;
    create(payload: Record<string, unknown>): Promise<any>;
    updateById(classId: string, update: Record<string, unknown>): Promise<unknown>;
    deleteById(classId: string): Promise<unknown>;
};

type ClassManagementCourseRepo = {
    findById(courseId: string): Promise<any | null>;
    pullClassId(courseId: string, classId: string): Promise<unknown>;
    pushClassId(courseId: string, classId: unknown): Promise<unknown>;
};

type ClassManagementChapterRepo = {
    deleteByIds(chapterIds: unknown[]): Promise<unknown>;
};

type ClassManagementServiceDeps = {
    classRepo?: ClassManagementClassRepo;
    courseRepo?: ClassManagementCourseRepo;
    chapterRepo?: ClassManagementChapterRepo;
};

const defaultClassRepo: ClassManagementClassRepo = {
    findById: (classId) => ClassModel.findById(classId).exec(),
    findOneLean: (query) => ClassModel.findOne(query as any).lean().exec(),
    listLean: (query) => ClassModel.find(query as any).lean().exec(),
    create: async (payload) => {
        const classDoc = new ClassModel(payload);
        return classDoc.save();
    },
    updateById: (classId, update) => ClassModel.findByIdAndUpdate(classId, update).exec(),
    deleteById: (classId) => ClassModel.findByIdAndDelete(classId).exec()
};

const defaultCourseRepo: ClassManagementCourseRepo = {
    findById: (courseId) => CourseModel.findById(courseId).exec(),
    pullClassId: (courseId, classId) => CourseModel.findByIdAndUpdate(courseId, {
        $pull: { class_ids: classId }
    }).exec(),
    pushClassId: (courseId, classId) => CourseModel.findByIdAndUpdate(courseId, {
        $push: { class_ids: classId }
    }).exec()
};

const defaultChapterRepo: ClassManagementChapterRepo = {
    deleteByIds: (chapterIds) => ChapterModel.deleteMany({ _id: { $in: chapterIds } }).exec()
};

export class ClassManagementService {
    private readonly classRepo: ClassManagementClassRepo;
    private readonly courseRepo: ClassManagementCourseRepo;
    private readonly chapterRepo: ClassManagementChapterRepo;

    constructor(deps: ClassManagementServiceDeps = {}) {
        this.classRepo = deps.classRepo ?? defaultClassRepo;
        this.courseRepo = deps.courseRepo ?? defaultCourseRepo;
        this.chapterRepo = deps.chapterRepo ?? defaultChapterRepo;
    }

    public async getClassById(input: {
        user: User;
        classId: unknown;
    }): Promise<resp<any>> {
        const classIdResult = validateObjectIdInput(input.classId, "class_id");
        if (!classIdResult.valid) {
            return createResponse(400, "Invalid class_id format");
        }
        const classId = classIdResult.value;

        const classData = await this.classRepo.findById(classId);
        if (!classData) {
            return createResponse(404, "Class not found");
        }

        const course = await this.courseRepo.findById(classData.course_id);
        if (!course) {
            return createResponse(404, "Associated course not found");
        }

        if (!this.isCourseOwner(input.user, course)) {
            return createResponse(403, "You are not authorized to view this class");
        }

        return createResponse(200, "success", { classData });
    }

    public async updateClassById(input: {
        user: User;
        classId: unknown;
        body: Record<string, unknown>;
    }): Promise<resp<string | undefined>> {
        const classIdResult = validateObjectIdInput(input.classId, "class_id");
        if (!classIdResult.valid) {
            return createResponse(400, "Invalid class_id format");
        }
        const classId = classIdResult.value;

        const classDoc = await this.classRepo.findById(classId);
        if (!classDoc) {
            return createResponse(404, "Class not found");
        }

        const course = await this.courseRepo.findById(classDoc.course_id);
        if (!course) {
            return createResponse(404, "Associated course not found");
        }

        if (!this.isCourseOwner(input.user, course)) {
            return createResponse(403, "You are not authorized to update this class");
        }

        const updatePolicy = validateClassUpdateInput(input.body);
        if (!updatePolicy.valid) {
            return createResponse(400, updatePolicy.message);
        }
        const updateData: Record<string, unknown> = { ...updatePolicy.updates };

        if (updateData.class_name !== undefined && updateData.class_name !== classDoc.class_name) {
            const existingClass = await this.classRepo.findOneLean({
                course_id: classDoc.course_id,
                class_name: updateData.class_name,
                _id: { $ne: classId }
            });
            if (existingClass) {
                return createResponse(400, "Class with this name already exists in the course");
            }
        }

        await this.classRepo.updateById(classId, updateData);
        return createResponse(200, "Update class successfully");
    }

    public async deleteClassById(input: {
        user: User;
        classId: unknown;
    }): Promise<resp<string | undefined>> {
        const classIdResult = validateObjectIdInput(input.classId, "class_id");
        if (!classIdResult.valid) {
            return createResponse(400, "Invalid class_id format");
        }
        const classId = classIdResult.value;

        const classDoc = await this.classRepo.findById(classId);
        if (!classDoc) {
            return createResponse(404, "Class not found");
        }

        const course = await this.courseRepo.findById(classDoc.course_id);
        if (!course) {
            return createResponse(404, "Associated course not found");
        }

        if (!this.isCourseOwner(input.user, course)) {
            return createResponse(403, "You are not authorized to delete this class");
        }

        await this.courseRepo.pullClassId(classDoc.course_id, classId);
        if (Array.isArray(classDoc.chapter_ids) && classDoc.chapter_ids.length > 0) {
            await this.chapterRepo.deleteByIds(classDoc.chapter_ids);
        }
        await this.classRepo.deleteById(classId);

        return createResponse(200, "Delete class successfully");
    }

    public async addClassToCourse(input: {
        user: User;
        courseId: unknown;
        body: Record<string, unknown>;
    }): Promise<resp<String | { class_id: string } | undefined>> {
        const courseIdResult = validateObjectIdInput(input.courseId, "course_id");
        if (!courseIdResult.valid) {
            return createResponse(400, "Invalid course_id format");
        }
        const courseId = courseIdResult.value;

        const course = await this.courseRepo.findById(courseId);
        if (!course) {
            return createResponse(404, "Course not found");
        }

        const createPolicy = validateClassCreateInput(input.body);
        if (!createPolicy.valid) {
            return createResponse(400, createPolicy.message);
        }

        const existingClass = await this.classRepo.findOneLean({
            course_id: courseId,
            class_name: createPolicy.fields.class_name
        });
        if (existingClass) {
            return createResponse(400, "Class with this name already exists in the course");
        }

        if (!this.isCourseOwner(input.user, course)) {
            return createResponse(403, "You are not authorized to add classes to this course");
        }

        const existingClasses = await this.classRepo.listLean({
            course_id: courseId,
            class_order: createPolicy.fields.class_order
        });
        if (existingClasses.length > 0) {
            return createResponse(400, "A class with the same order already exists in this course");
        }

        const savedClass = await this.classRepo.create({
            course_id: courseId,
            class_name: createPolicy.fields.class_name,
            class_subtitle: createPolicy.fields.class_subtitle,
            class_order: createPolicy.fields.class_order,
            chapter_ids: []
        });

        await this.courseRepo.pushClassId(courseId, savedClass._id);
        return createResponse(200, "Class added successfully", { class_id: String(savedClass._id) });
    }

    private isCourseOwner(user: User, course: any): boolean {
        return user._id!.toString() === course.submitter_user_id.toString();
    }
}

export const classManagementService = new ClassManagementService();
