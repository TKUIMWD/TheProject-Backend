import { logger } from "../../middlewares/log";
import { resp, createResponse } from "../../utils/resp";
import { courseChapterRepository } from "./CourseChapterRepository";
import { courseClassRepository } from "./CourseClassRepository";
import { courseRepository } from "./CourseRepository";
import {
    validateCourseReviewableStatus,
    validateCourseVisibilityStatus,
    validateCourseVisibilityTransition
} from "./CourseStatusPolicy";
import {
    validateCourseClassIdsForSubmission,
    validateCourseSubmissionReadiness
} from "./CourseSubmissionPolicy";

type CourseRepositoryPort = {
    findById(courseId: string): Promise<any | null>;
};

type CourseClassRepositoryPort = {
    listByIds(classIds: string[], options?: unknown): Promise<any[]>;
    listChapterRefsByIds(classIds: string[]): Promise<any[]>;
};

type CourseChapterRepositoryPort = {
    syncApprovedContentByIds(chapterIds: string[]): Promise<{ modifiedCount?: number }>;
};

export type CourseLifecycleServiceDeps = {
    courses?: CourseRepositoryPort;
    classes?: CourseClassRepositoryPort;
    chapters?: CourseChapterRepositoryPort;
};

export class CourseLifecycleService {
    private readonly courses: CourseRepositoryPort;
    private readonly classes: CourseClassRepositoryPort;
    private readonly chapters: CourseChapterRepositoryPort;

    constructor(deps: CourseLifecycleServiceDeps = {}) {
        this.courses = deps.courses ?? courseRepository;
        this.classes = deps.classes ?? courseClassRepository;
        this.chapters = deps.chapters ?? courseChapterRepository;
    }

    public async approveCourse(input: { courseId: string; actorUserId: string }): Promise<resp<String | undefined>> {
        const course = await this.courses.findById(input.courseId);
        if (!course) return createResponse(404, "Course not found");

        const reviewableStatus = validateCourseReviewableStatus(course.status);
        if (!reviewableStatus.valid) return createResponse(400, reviewableStatus.message);

        logger.info(`Course ${input.courseId} is being approved. Syncing chapter content...`);
        const classIds = course.class_ids || [];
        if (classIds.length > 0) {
            const classes = await this.classes.listChapterRefsByIds(classIds);
            const allChapterIds = classes.flatMap(cls => cls.chapter_ids);
            if (allChapterIds.length > 0) {
                const updateResult = await this.chapters.syncApprovedContentByIds(allChapterIds);
                logger.info(`Synced content for ${updateResult.modifiedCount} chapters in course ${input.courseId}.`);
            }
        }

        course.status = "未公開";
        const updatedCourse = await course.save();
        if (!updatedCourse) return createResponse(500, "Failed to update course status");

        logger.info(`Course ${input.courseId} approved successfully by user ${input.actorUserId}`);
        return createResponse(200, "Course approved successfully");
    }

    public async unapproveCourse(input: { courseId: string; actorUserId: string }): Promise<resp<String | undefined>> {
        const course = await this.courses.findById(input.courseId);
        if (!course) return createResponse(404, "Course not found");

        const reviewableStatus = validateCourseReviewableStatus(course.status);
        if (!reviewableStatus.valid) return createResponse(400, reviewableStatus.message);

        course.status = "審核未通過";
        const updatedCourse = await course.save();
        if (!updatedCourse) return createResponse(500, "Failed to update course status");

        logger.info(`Course ${input.courseId} unapproved successfully by user ${input.actorUserId}`);
        return createResponse(200, "Course unapproved successfully");
    }

    public async submitCourse(input: { courseId: string; actorUserId: string }): Promise<resp<String | undefined>> {
        const course = await this.courses.findById(input.courseId);
        if (!course) return createResponse(404, "Course not found");

        if (course.submitter_user_id !== input.actorUserId) {
            return createResponse(403, "You are not authorized to submit this course");
        }

        const classIdsReady = validateCourseClassIdsForSubmission(course.class_ids);
        if (!classIdsReady.valid) return createResponse(400, classIdsReady.message);

        const classes = await this.classes.listByIds(course.class_ids, { lean: true });
        const readiness = validateCourseSubmissionReadiness(course.class_ids, classes);
        if (!readiness.valid) return createResponse(400, readiness.message);

        course.status = "審核中";
        const updatedCourse = await course.save();
        if (!updatedCourse) return createResponse(500, "Failed to update course status");

        logger.info(`Course ${input.courseId} submitted for review successfully by user ${input.actorUserId}`);
        return createResponse(200, "Course submitted for review successfully");
    }

    public async setVisibility(input: { courseId: string; status: unknown; actorUserId: string }): Promise<resp<String | undefined>> {
        const statusPolicy = validateCourseVisibilityStatus(input.status);
        if (!statusPolicy.valid) return createResponse(400, statusPolicy.message);

        const course = await this.courses.findById(input.courseId);
        if (!course) return createResponse(404, "Course not found");

        if (course.submitter_user_id !== input.actorUserId) {
            return createResponse(403, "You are not authorized to change the status of this course");
        }

        const transitionPolicy = validateCourseVisibilityTransition(course.status, statusPolicy.status);
        if (!transitionPolicy.valid) return createResponse(400, transitionPolicy.message);

        course.status = statusPolicy.status;
        const updatedCourse = await course.save();
        if (!updatedCourse) return createResponse(500, "Failed to update course status");

        logger.info(`Course ${input.courseId} status changed to ${statusPolicy.status} by user ${input.actorUserId}`);
        return createResponse(200, `Course status updated to ${statusPolicy.status} successfully`);
    }
}

export const courseLifecycleService = new CourseLifecycleService();
