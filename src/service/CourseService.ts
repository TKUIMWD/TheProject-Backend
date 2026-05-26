import { Service } from "../abstract/Service";
import { CoursePageDTO } from "../interfaces/Course/CoursePageDTO";
import { validateTokenAndGetAdminUser, validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { resp, createResponse } from "../utils/resp";
import { Request } from "express";
import { logger } from "../middlewares/log";
import { CourseMenu } from "../interfaces/Course/CourseMenu";
import { CourseInfo } from "../interfaces/Course/Course";
import { courseRequestAdapterService } from "../modules/courses/CourseRequestAdapterService";

type CourseHandler<T> = (user: any) => Promise<resp<T | undefined>>;

export class CourseService extends Service {
    public async getCourseById(Request: Request): Promise<resp<CoursePageDTO | undefined>> {
        return this.withUser(Request, "getCourseById", user =>
            courseRequestAdapterService.getCourseById({ user, params: Request.params })
        );
    }

    public async getCourseMenu(Request: Request): Promise<resp<CourseMenu | undefined>> {
        return this.withUser(Request, "getCourseMenu", user =>
            courseRequestAdapterService.getCourseMenu({ user, params: Request.params })
        );
    }

    public async AddCourse(Request: Request): Promise<resp<String | { course_id: String } | undefined>> {
        return this.withAdmin(Request, "AddCourse", user =>
            courseRequestAdapterService.addCourse({ user, body: Request.body })
        );
    }

    public async UpdateCourseById(Request: Request): Promise<resp<String | { course_id: string } | undefined>> {
        return this.withAdmin(Request, "UpdateCourseById", user =>
            courseRequestAdapterService.updateCourseById({ user, params: Request.params, body: Request.body })
        );
    }

    public async DeleteCourseById(Request: Request): Promise<resp<String | undefined>> {
        return this.withAdmin(Request, "DeleteCourseById", user =>
            courseRequestAdapterService.deleteCourseById({ user, params: Request.params })
        );
    }

    public async GetAllPublicCourses(_Request: Request): Promise<resp<String | CourseInfo[] | undefined>> {
        return this.withoutAuth("GetAllPublicCourse", () => courseRequestAdapterService.listPublicCourses());
    }

    public async JoinCourseById(Request: Request): Promise<resp<String | undefined>> {
        return this.withUser(Request, "JoinCourseById", user =>
            courseRequestAdapterService.joinCourseById({ user, params: Request.params })
        );
    }

    public async rateCourse(Request: Request): Promise<resp<any>> {
        return this.withUser(Request, "rateCourse", user =>
            courseRequestAdapterService.rateCourse({ user, body: Request.body })
        );
    }

    public async getCourseReviews(Request: Request): Promise<resp<any>> {
        return this.withUser(Request, "getCourseReviews", user =>
            courseRequestAdapterService.getCourseReviews({ user, query: Request.query })
        );
    }

    public async updateCourseReview(Request: Request): Promise<resp<any>> {
        return this.withUser(Request, "updateCourseReview", user =>
            courseRequestAdapterService.updateCourseReview({ user, params: Request.params, body: Request.body })
        );
    }

    public async deleteCourseReview(Request: Request): Promise<resp<any>> {
        return this.withUser(Request, "deleteCourseReview", user =>
            courseRequestAdapterService.deleteCourseReview({ user, params: Request.params, query: Request.query })
        );
    }

    public async ApprovedCourseById(Request: Request): Promise<resp<String | undefined>> {
        return this.withSuperAdmin(Request, "ApprovedCourseById", user =>
            courseRequestAdapterService.approveCourseById({ user, params: Request.params })
        );
    }

    public async UnApprovedCourseById(Request: Request): Promise<resp<String | undefined>> {
        return this.withSuperAdmin(Request, "UnApprovedCourseById", user =>
            courseRequestAdapterService.unapproveCourseById({ user, params: Request.params })
        );
    }

    public async InviteToJoinCourse(Request: Request): Promise<resp<String | undefined>> {
        return this.withAdmin(Request, "InviteToJoinCourse", user =>
            courseRequestAdapterService.inviteToJoinCourse({ user, body: Request.body })
        );
    }

    public async getFirstTemplateByCourseID(Request: Request): Promise<resp<String | { template_id: string } | undefined>> {
        return this.withUser(Request, "getFirstTemplateByCourseID", user =>
            courseRequestAdapterService.getFirstTemplateByCourseID({ user, params: Request.params })
        );
    }

    public async getAllCourses(Request: Request): Promise<resp<String | CourseInfo[] | undefined>> {
        return this.withSuperAdmin(Request, "GetAllCourses", () => courseRequestAdapterService.listAllCourses());
    }

    public async getAllSubmittedCourses(Request: Request): Promise<resp<String | CourseInfo[] | undefined>> {
        return this.withSuperAdmin(Request, "GetAllPendingCourses", () => courseRequestAdapterService.listSubmittedCourses());
    }

    public async submitCourse(Request: Request): Promise<resp<String | undefined>> {
        return this.withAdmin(Request, "submitCourse", user =>
            courseRequestAdapterService.submitCourse({ user, body: Request.body })
        );
    }

    public async setCourseStatus(Request: Request): Promise<resp<String | undefined>> {
        return this.withAdmin(Request, "setCourseStatus", user =>
            courseRequestAdapterService.setCourseStatus({ user, body: Request.body })
        );
    }

    private async withoutAuth<T>(logContext: string, handler: () => Promise<resp<T | undefined>>): Promise<resp<T | undefined>> {
        try {
            return handler();
        } catch (err) {
            logger.error(`Error in ${logContext}:`, err);
            return createResponse(500, "Internal Server Error");
        }
    }

    private async withUser<T>(Request: Request, logContext: string, handler: CourseHandler<T>): Promise<resp<T | undefined>> {
        return this.withAuthenticated(Request, logContext, validateTokenAndGetUser, handler);
    }

    private async withAdmin<T>(Request: Request, logContext: string, handler: CourseHandler<T>): Promise<resp<T | undefined>> {
        return this.withAuthenticated(Request, logContext, validateTokenAndGetAdminUser, handler);
    }

    private async withSuperAdmin<T>(Request: Request, logContext: string, handler: CourseHandler<T>): Promise<resp<T | undefined>> {
        return this.withAuthenticated(Request, logContext, validateTokenAndGetSuperAdminUser, handler);
    }

    private async withAuthenticated<T>(
        Request: Request,
        logContext: string,
        validator: typeof validateTokenAndGetUser,
        handler: CourseHandler<T>
    ): Promise<resp<T | undefined>> {
        try {
            const { user, error } = await validator<T>(Request);
            if (error) {
                return error;
            }
            return handler(user);
        } catch (err) {
            logger.error(`Error in ${logContext}:`, err);
            return createResponse(500, "Internal Server Error");
        }
    }
}
