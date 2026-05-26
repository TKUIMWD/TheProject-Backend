import mongoose from "mongoose";
import { Course } from "../../interfaces/Course/Course";
import { User } from "../../interfaces/User";
import { logger } from "../../middlewares/log";
import { createResponse, resp } from "../../utils/resp";
import { buildJoinedCourseIds } from "./CourseAccessPolicy";
import {
    buildCourseCreatePayload,
    buildCourseMutationResponse,
    buildCourseUpdatePayload,
    CourseContentFields,
    validateCourseCreateInput,
    validateCourseUpdateInput
} from "./CourseContentPolicy";
import { courseChapterRepository } from "./CourseChapterRepository";
import { courseClassRepository } from "./CourseClassRepository";
import { courseRepository } from "./CourseRepository";
import { userRepository } from "../users/UserRepository";

type CourseMutationRepository = {
    findById(courseId: string, options?: { lean?: boolean }): Promise<any | null>;
    findByName(courseName: string): Promise<any | null>;
    createCourseDocument(payload: unknown): { save(): Promise<any> };
    updateById(courseId: string, update: unknown, options?: unknown): Promise<any | null>;
    deleteById(courseId: unknown): Promise<any | null>;
};

type CourseUserMutationRepository = {
    updateCourseIds(userId: string, courseIds: string[]): Promise<any | null>;
    removeCourseFromAllUsers(courseId: string): Promise<any>;
};

type CourseClassMutationRepository = {
    listChapterRefsByIds(classIds: string[]): Promise<Array<{ chapter_ids: string[] }>>;
    deleteByIds(classIds: string[]): Promise<unknown>;
};

type CourseChapterMutationRepository = {
    deleteByIds(chapterIds: string[]): Promise<unknown>;
};

type CourseMutationServiceDeps = {
    courseRepo?: CourseMutationRepository;
    userRepo?: CourseUserMutationRepository;
    classRepo?: CourseClassMutationRepository;
    chapterRepo?: CourseChapterMutationRepository;
    idFactory?: () => string;
};

export class CourseMutationService {
    private readonly courseRepo: CourseMutationRepository;
    private readonly userRepo: CourseUserMutationRepository;
    private readonly classRepo: CourseClassMutationRepository;
    private readonly chapterRepo: CourseChapterMutationRepository;
    private readonly idFactory: () => string;

    constructor(deps: CourseMutationServiceDeps = {}) {
        this.courseRepo = deps.courseRepo ?? courseRepository;
        this.userRepo = deps.userRepo ?? userRepository;
        this.classRepo = deps.classRepo ?? courseClassRepository;
        this.chapterRepo = deps.chapterRepo ?? courseChapterRepository;
        this.idFactory = deps.idFactory ?? (() => new mongoose.Types.ObjectId().toString());
    }

    public async createCourse(input: {
        user: User;
        request: Partial<Record<keyof CourseContentFields, unknown>>;
    }): Promise<resp<String | { course_id: String } | undefined>> {
        const userId = input.user._id?.toString();
        if (!userId) {
            return createResponse(401, "Invalid user");
        }

        const createInput = validateCourseCreateInput(input.request);
        if (!createInput.valid) {
            return createResponse(400, createInput.message);
        }

        const existingCourse = await this.courseRepo.findByName(createInput.fields.course_name);
        if (existingCourse) {
            return createResponse(400, "Course with the same name already exists");
        }

        const newCourse: Course = buildCourseCreatePayload({
            courseId: this.idFactory(),
            fields: createInput.fields,
            submitterUserId: userId
        });

        const savedCourse = await this.courseRepo.createCourseDocument(newCourse).save();
        try {
            const nextCourseIds = buildJoinedCourseIds(input.user.course_ids, String(savedCourse._id));
            const updateResult = await this.userRepo.updateCourseIds(userId, nextCourseIds);

            if (!updateResult) {
                logger.error(`Failed to update user ${userId} with new course ID`);
                await this.courseRepo.deleteById(savedCourse._id);
                return createResponse(500, "Failed to associate course with user");
            }
        } catch (updateErr) {
            logger.error(`Error updating user with course: ${updateErr}`);
            await this.courseRepo.deleteById(savedCourse._id);
            return createResponse(500, "Failed to update user with new course");
        }

        if (!savedCourse) {
            return createResponse(500, "Failed to create course");
        }
        logger.info(`Course created successfully: ${savedCourse._id}`);
        return createResponse(200, "Course created successfully", buildCourseMutationResponse(savedCourse._id));
    }

    public async updateCourse(input: {
        user: User;
        courseId: string;
        request: Partial<Record<keyof CourseContentFields, unknown>>;
    }): Promise<resp<String | { course_id: string } | undefined>> {
        const userId = input.user._id?.toString();
        if (!userId) {
            return createResponse(401, "Invalid user");
        }

        const course = await this.courseRepo.findById(input.courseId);
        if (!course) {
            return createResponse(404, "Course not found");
        }

        if (course.submitter_user_id !== userId) {
            return createResponse(403, "You are not authorized to update this course");
        }

        const updateInput = validateCourseUpdateInput(input.request);
        if (!updateInput.valid) {
            return createResponse(400, updateInput.message);
        }
        const updates = buildCourseUpdatePayload({ updates: updateInput.updates });

        const updatedCourse = await this.courseRepo.updateById(
            input.courseId,
            { $set: updates },
            { new: true }
        );

        if (!updatedCourse) {
            return createResponse(404, "Course not found during update operation.");
        }

        logger.info(`Course updated successfully: ${input.courseId}`);
        return createResponse(200, "Course updated successfully", buildCourseMutationResponse(course._id));
    }

    public async deleteCourse(courseId: string): Promise<resp<String | undefined>> {
        const courseToDelete = await this.courseRepo.findById(courseId, { lean: true });
        if (!courseToDelete) {
            return createResponse(404, "Course not found");
        }

        if (courseToDelete.class_ids && courseToDelete.class_ids.length > 0) {
            const classes = await this.classRepo.listChapterRefsByIds(courseToDelete.class_ids);
            const chapterIdsToDelete = classes.flatMap(cls => cls.chapter_ids);

            if (chapterIdsToDelete.length > 0) {
                await this.chapterRepo.deleteByIds(chapterIdsToDelete);
                logger.info(`Deleted ${chapterIdsToDelete.length} chapters for course ${courseId}`);
            }

            await this.classRepo.deleteByIds(courseToDelete.class_ids);
            logger.info(`Deleted ${courseToDelete.class_ids.length} classes for course ${courseId}`);
        }

        await this.userRepo.removeCourseFromAllUsers(courseId);
        logger.info(`Removed course ${courseId} from all users' course lists`);

        await this.courseRepo.deleteById(courseId);

        logger.info(`Course deleted successfully: ${courseId}`);
        return createResponse(200, "Course and all its related classes and chapters deleted successfully");
    }
}

export const courseMutationService = new CourseMutationService();
