import { Service } from "../abstract/Service";
import { CoursePageDTO } from "../interfaces/Course/CoursePageDTO";
import { validateTokenAndGetAdminUser, validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { resp, createResponse } from "../utils/resp";
import { Request } from "express";
import { logger } from "../middlewares/log";
import { CourseMenu } from "../interfaces/Course/CourseMenu";
import { CourseInfo } from "../interfaces/Course/Course";
import { courseRequestAdapterService } from "../modules/courses/CourseRequestAdapterService";

type TokenValidator = <T>(request: Request) => Promise<{ user: any; error?: resp<T | undefined> }>;
type CourseServiceAdapterInput = {
    user: any;
    params: Request["params"];
    body: any;
    query: Request["query"];
};

export class CourseService extends Service {
    public async getCourseById(Request: Request): Promise<resp<CoursePageDTO | undefined>> {
        return this.withUserInput(Request, "getCourseById", (input) => courseRequestAdapterService.getCourseById(input));
    }

    public async getCourseMenu(Request: Request): Promise<resp<CourseMenu | undefined>> {
        return this.withUserInput(Request, "getCourseMenu", (input) => courseRequestAdapterService.getCourseMenu(input));
    }

    public async AddCourse(Request: Request): Promise<resp<String | { course_id: String } | undefined>> {
        return this.withAdminInput(Request, "AddCourse", (input) => courseRequestAdapterService.addCourse(input));
    }

    public async UpdateCourseById(Request: Request): Promise<resp<String | { course_id: string } | undefined>> {
        return this.withAdminInput(Request, "UpdateCourseById", (input) => courseRequestAdapterService.updateCourseById(input));
    }

    public async DeleteCourseById(Request: Request): Promise<resp<String | undefined>> {
        return this.withAdminInput(Request, "DeleteCourseById", (input) => courseRequestAdapterService.deleteCourseById(input));
    }

    public async GetAllPublicCourses(_Request: Request): Promise<resp<String | CourseInfo[] | undefined>> {
        return this.withoutAuth("GetAllPublicCourse", () => courseRequestAdapterService.listPublicCourses());
    }

    public async JoinCourseById(Request: Request): Promise<resp<String | undefined>> {
        return this.withUserInput(Request, "JoinCourseById", (input) => courseRequestAdapterService.joinCourseById(input));
    }

    public async rateCourse(Request: Request): Promise<resp<any>> {
        return this.withUserInput(Request, "rateCourse", (input) => courseRequestAdapterService.rateCourse(input));
    }

    public async getCourseReviews(Request: Request): Promise<resp<any>> {
        return this.withUserInput(Request, "getCourseReviews", (input) => courseRequestAdapterService.getCourseReviews(input));
    }

    public async updateCourseReview(Request: Request): Promise<resp<any>> {
        return this.withUserInput(Request, "updateCourseReview", (input) => courseRequestAdapterService.updateCourseReview(input));
    }

    public async deleteCourseReview(Request: Request): Promise<resp<any>> {
        return this.withUserInput(Request, "deleteCourseReview", (input) => courseRequestAdapterService.deleteCourseReview(input));
    }

    public async ApprovedCourseById(Request: Request): Promise<resp<String | undefined>> {
        return this.withSuperAdminInput(Request, "ApprovedCourseById", (input) => courseRequestAdapterService.approveCourseById(input));
    }

    public async UnApprovedCourseById(Request: Request): Promise<resp<String | undefined>> {
        return this.withSuperAdminInput(Request, "UnApprovedCourseById", (input) => courseRequestAdapterService.unapproveCourseById(input));
    }

    public async InviteToJoinCourse(Request: Request): Promise<resp<String | undefined>> {
        return this.withAdminInput(Request, "InviteToJoinCourse", (input) => courseRequestAdapterService.inviteToJoinCourse(input));
    }

    public async getFirstTemplateByCourseID(Request: Request): Promise<resp<String | { template_id: string } | undefined>> {
        return this.withUserInput(Request, "getFirstTemplateByCourseID", (input) =>
            courseRequestAdapterService.getFirstTemplateByCourseID(input)
        );
    }

    public async getAllCourses(Request: Request): Promise<resp<String | CourseInfo[] | undefined>> {
        return this.withSuperAdminInput(Request, "GetAllCourses", () => courseRequestAdapterService.listAllCourses());
    }

    public async getAllSubmittedCourses(Request: Request): Promise<resp<String | CourseInfo[] | undefined>> {
        return this.withSuperAdminInput(Request, "GetAllPendingCourses", () => courseRequestAdapterService.listSubmittedCourses());
    }

    public async submitCourse(Request: Request): Promise<resp<String | undefined>> {
        return this.withAdminInput(Request, "submitCourse", (input) => courseRequestAdapterService.submitCourse(input));
    }

    public async setCourseStatus(Request: Request): Promise<resp<String | undefined>> {
        return this.withAdminInput(Request, "setCourseStatus", (input) => courseRequestAdapterService.setCourseStatus(input));
    }

    private async withoutAuth<T>(logContext: string, handler: () => Promise<resp<T | undefined>>): Promise<resp<T | undefined>> {
        try {
            return handler();
        } catch (err) {
            logger.error(`Error in ${logContext}:`, err);
            return createResponse(500, "Internal Server Error");
        }
    }

    private async withUserInput<T>(
        Request: Request,
        logContext: string,
        handler: (input: CourseServiceAdapterInput) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        return this.withAuthenticatedInput(Request, logContext, validateTokenAndGetUser, handler);
    }

    private async withAdminInput<T>(
        Request: Request,
        logContext: string,
        handler: (input: CourseServiceAdapterInput) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        return this.withAuthenticatedInput(Request, logContext, validateTokenAndGetAdminUser, handler);
    }

    private async withSuperAdminInput<T>(
        Request: Request,
        logContext: string,
        handler: (input: CourseServiceAdapterInput) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        return this.withAuthenticatedInput(Request, logContext, validateTokenAndGetSuperAdminUser, handler);
    }

    private async withAuthenticatedInput<T>(
        Request: Request,
        logContext: string,
        validator: TokenValidator,
        handler: (input: CourseServiceAdapterInput) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        try {
            const { user, error } = await validator<T>(Request);
            if (error) {
                return error;
            }
            return handler(this.toAdapterInput(Request, user));
        } catch (err) {
            logger.error(`Error in ${logContext}:`, err);
            return createResponse(500, "Internal Server Error");
        }
    }

    private toAdapterInput(Request: Request, user: any): CourseServiceAdapterInput {
        return {
            user,
            params: Request.params,
            body: Request.body,
            query: Request.query
        };
    }
}
