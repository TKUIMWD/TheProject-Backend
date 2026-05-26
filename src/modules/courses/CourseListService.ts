import { CourseInfo } from "../../interfaces/Course/Course";
import { logger } from "../../middlewares/log";
import { resp, createResponse } from "../../utils/resp";
import { userRepository } from "../users/UserRepository";
import {
    buildCourseInfoList,
    collectCourseSubmitterIds
} from "./CourseListDTOFactory";
import { courseRepository } from "./CourseRepository";

type CourseRepositoryPort = {
    listAll(options?: { lean?: boolean }): Promise<any[]>;
    listByStatus(status: string, options?: { lean?: boolean }): Promise<any[]>;
};

type UserRepositoryPort = {
    listByIds(userIds: string[], options?: { lean?: boolean }): Promise<any[]>;
};

export type CourseListServiceDeps = {
    courses?: CourseRepositoryPort;
    users?: UserRepositoryPort;
};

export class CourseListService {
    private readonly courses: CourseRepositoryPort;
    private readonly users: UserRepositoryPort;

    constructor(deps: CourseListServiceDeps = {}) {
        this.courses = deps.courses ?? courseRepository;
        this.users = deps.users ?? userRepository;
    }

    public async listPublicCourses(): Promise<resp<String | CourseInfo[] | undefined>> {
        const courses = await this.listCourseInfoByStatus("公開");
        if (!courses) {
            return createResponse(404, "No public courses found");
        }

        return createResponse(200, "success", courses);
    }

    public async listAllCourses(): Promise<resp<String | CourseInfo[] | undefined>> {
        const courseDocs = await this.courses.listAll({ lean: true });
        const courses = await this.buildCourseInfoResponse(courseDocs);
        if (!courses || courses.length === 0) {
            return createResponse(404, "No courses found");
        }

        return createResponse(200, "success", courses);
    }

    public async listSubmittedCourses(): Promise<resp<String | CourseInfo[] | undefined>> {
        const courses = await this.listCourseInfoByStatus("審核中");
        if (!courses) {
            return createResponse(404, "No pending courses found");
        }

        if (courses.length === 0) {
            return createResponse(200, "No pending courses found", []);
        }

        return createResponse(200, "success", courses);
    }

    private async listCourseInfoByStatus(status: string): Promise<CourseInfo[] | undefined> {
        const courseDocs = await this.courses.listByStatus(status, { lean: true });
        return this.buildCourseInfoResponse(courseDocs);
    }

    private async buildCourseInfoResponse(courseDocs: any[]): Promise<CourseInfo[] | undefined> {
        const submitters = await this.users.listByIds(collectCourseSubmitterIds(courseDocs), { lean: true });
        const courseList = buildCourseInfoList(courseDocs, submitters);
        courseList.missingSubmitterCourseIds.forEach((courseId) => logger.warn(`Submitter not found for course ${courseId}`));
        return courseList.courses;
    }
}

export const courseListService = new CourseListService();
