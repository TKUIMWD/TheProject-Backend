import { Course, CourseInfo } from "../../interfaces/Course/Course";
import { CourseMenu } from "../../interfaces/Course/CourseMenu";
import { CoursePageDTO } from "../../interfaces/Course/CoursePageDTO";
import { User } from "../../interfaces/User";
import { createResponse, resp } from "../../utils/resp";
import { validateObjectIdInput } from "../common/ObjectIdPolicy";
import { userRepository } from "../users/UserRepository";
import { canAccessCourseTemplate, canAccessJoinedCourse } from "./CourseAccessPolicy";
import { courseChapterRepository } from "./CourseChapterRepository";
import { courseClassRepository } from "./CourseClassRepository";
import { buildCourseMenuDTO, collectCourseMenuChapterIds, selectFirstCourseTemplateId } from "./CourseMenuDTOFactory";
import { buildCoursePageDTO } from "./CoursePageDTOFactory";
import { courseRepository } from "./CourseRepository";

type CourseReadServiceDeps = {
    userRepo?: {
        findById(userId: string, options?: { lean?: boolean }): Promise<any | null>;
    };
    courseRepo?: {
        findById(courseId: string, options?: { lean?: boolean }): Promise<Course | null>;
    };
    classRepo?: {
        listByIds(classIds: string[], options?: { lean?: boolean }): Promise<any[]>;
    };
    chapterRepo?: {
        listByIds(chapterIds: string[], options?: { lean?: boolean }): Promise<any[]>;
    };
};

type AuthorizedCourseResult =
    | { success: true; isAuthorized: boolean; course: Course; courseId: string }
    | { success: false; errorResp: resp<undefined> };

export class CourseReadService {
    private readonly userRepo: NonNullable<CourseReadServiceDeps["userRepo"]>;
    private readonly courseRepo: NonNullable<CourseReadServiceDeps["courseRepo"]>;
    private readonly classRepo: NonNullable<CourseReadServiceDeps["classRepo"]>;
    private readonly chapterRepo: NonNullable<CourseReadServiceDeps["chapterRepo"]>;

    constructor(deps: CourseReadServiceDeps = {}) {
        this.userRepo = deps.userRepo ?? userRepository;
        this.courseRepo = deps.courseRepo ?? courseRepository;
        this.classRepo = deps.classRepo ?? courseClassRepository;
        this.chapterRepo = deps.chapterRepo ?? courseChapterRepository;
    }

    public async getCoursePage(input: {
        user: User;
        courseId: unknown;
    }): Promise<resp<CoursePageDTO | undefined>> {
        const authResult = await this.getAuthorizedCourse(input.user, input.courseId);
        if (!authResult.success) return authResult.errorResp;

        const submitter = await this.userRepo.findById(authResult.course.submitter_user_id, { lean: true });
        if (!submitter) {
            return createResponse(404, "Submitter not found");
        }

        const courseData = buildCoursePageDTO(authResult.course, submitter);
        if (!authResult.isAuthorized) {
            return createResponse(403, "You are not joined to this course", courseData);
        }

        return createResponse(200, "Course page data retrieved successfully", courseData);
    }

    public async getCourseMenu(input: {
        user: User;
        courseId: unknown;
    }): Promise<resp<CourseMenu | undefined>> {
        const authResult = await this.getAuthorizedCourse(input.user, input.courseId);
        if (!authResult.success) return authResult.errorResp;

        const classes = await this.classRepo.listByIds(authResult.course.class_ids, { lean: true });
        if (!classes || classes.length === 0) {
            return createResponse(404, "No classes found for this course");
        }

        const chapters = await this.chapterRepo.listByIds(collectCourseMenuChapterIds(classes), { lean: true });
        const courseMenuData = buildCourseMenuDTO(classes, chapters);
        if (!authResult.isAuthorized) {
            return createResponse(403, "You are not joined to this course", courseMenuData);
        }

        return createResponse(200, "Course menu data retrieved successfully", courseMenuData);
    }

    public async getFirstTemplate(input: {
        user: User;
        courseId: unknown;
    }): Promise<resp<String | { template_id: string } | undefined>> {
        const authResult = await this.getAuthorizedCourse(input.user, input.courseId);
        if (!authResult.success) return authResult.errorResp;

        if (!canAccessCourseTemplate({
            courseId: authResult.courseId,
            submitterUserId: authResult.course.submitter_user_id,
            userId: input.user._id?.toString(),
            userRole: input.user.role,
            joinedCourseIds: input.user.course_ids
        })) {
            return createResponse(403, "You are not authorized to access this course");
        }

        if (!authResult.course.class_ids || authResult.course.class_ids.length === 0) {
            return createResponse(404, "No classes found in this course");
        }

        const classes = await this.classRepo.listByIds(authResult.course.class_ids, { lean: true });
        if (!classes || classes.length === 0) {
            return createResponse(404, "Classes not found");
        }

        const chapterIds = collectCourseMenuChapterIds(classes);
        if (chapterIds.length === 0) {
            return createResponse(404, "No chapters found in this course");
        }

        const chapters = await this.chapterRepo.listByIds(chapterIds, { lean: true });
        if (!chapters || chapters.length === 0) {
            return createResponse(404, "Chapters not found");
        }

        const firstTemplateId = selectFirstCourseTemplateId(classes, chapters);
        if (firstTemplateId) return createResponse(200, "success", { template_id: firstTemplateId });

        return createResponse(404, "No template_id found in any chapter of this course");
    }

    private async getAuthorizedCourse(user: User, courseIdInput: unknown): Promise<AuthorizedCourseResult> {
        const courseIdResult = validateObjectIdInput(courseIdInput, "course_id");
        if (!courseIdResult.valid) {
            return { success: false, errorResp: createResponse(400, "Invalid course_id format") };
        }

        const courseId = courseIdResult.value;
        const course = await this.courseRepo.findById(courseId, { lean: true });
        if (!course) {
            return { success: false, errorResp: createResponse(404, "Course not found") };
        }

        return {
            success: true,
            isAuthorized: canAccessJoinedCourse({
                courseId,
                joinedCourseIds: user.course_ids,
                userRole: user.role
            }),
            course,
            courseId
        };
    }
}

export const courseReadService = new CourseReadService();
