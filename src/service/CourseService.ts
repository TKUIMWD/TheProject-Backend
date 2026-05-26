import { Service } from "../abstract/Service";
import { CoursePageDTO } from "../interfaces/Course/CoursePageDTO";
import { resp, createResponse } from "../utils/resp";
import { logger } from "../middlewares/log";
import { CourseMenu } from "../interfaces/Course/CourseMenu";
import { CourseInfo } from "../interfaces/Course/Course";
import { courseRequestAdapterService } from "../modules/courses/CourseRequestAdapterService";

export type CourseServiceAdapterInput = {
    user: any;
    params?: Record<string, any>;
    body?: any;
    query?: Record<string, any>;
};

export class CourseService extends Service {
    public getCourseById(input: CourseServiceAdapterInput): Promise<resp<CoursePageDTO | undefined>> {
        return courseRequestAdapterService.getCourseById(this.normalizeInput(input));
    }

    public getCourseMenu(input: CourseServiceAdapterInput): Promise<resp<CourseMenu | undefined>> {
        return courseRequestAdapterService.getCourseMenu(this.normalizeInput(input));
    }

    public AddCourse(input: CourseServiceAdapterInput): Promise<resp<String | { course_id: String } | undefined>> {
        return courseRequestAdapterService.addCourse(this.normalizeInput(input));
    }

    public UpdateCourseById(input: CourseServiceAdapterInput): Promise<resp<String | { course_id: string } | undefined>> {
        return courseRequestAdapterService.updateCourseById(this.normalizeInput(input));
    }

    public DeleteCourseById(input: CourseServiceAdapterInput): Promise<resp<String | undefined>> {
        return courseRequestAdapterService.deleteCourseById(this.normalizeInput(input));
    }

    public async GetAllPublicCourses(): Promise<resp<String | CourseInfo[] | undefined>> {
        return this.withoutAuth("GetAllPublicCourse", () => courseRequestAdapterService.listPublicCourses());
    }

    public JoinCourseById(input: CourseServiceAdapterInput): Promise<resp<String | undefined>> {
        return courseRequestAdapterService.joinCourseById(this.normalizeInput(input));
    }

    public rateCourse(input: CourseServiceAdapterInput): Promise<resp<any>> {
        return courseRequestAdapterService.rateCourse(this.normalizeInput(input));
    }

    public getCourseReviews(input: CourseServiceAdapterInput): Promise<resp<any>> {
        return courseRequestAdapterService.getCourseReviews(this.normalizeInput(input));
    }

    public updateCourseReview(input: CourseServiceAdapterInput): Promise<resp<any>> {
        return courseRequestAdapterService.updateCourseReview(this.normalizeInput(input));
    }

    public deleteCourseReview(input: CourseServiceAdapterInput): Promise<resp<any>> {
        return courseRequestAdapterService.deleteCourseReview(this.normalizeInput(input));
    }

    public ApprovedCourseById(input: CourseServiceAdapterInput): Promise<resp<String | undefined>> {
        return courseRequestAdapterService.approveCourseById(this.normalizeInput(input));
    }

    public UnApprovedCourseById(input: CourseServiceAdapterInput): Promise<resp<String | undefined>> {
        return courseRequestAdapterService.unapproveCourseById(this.normalizeInput(input));
    }

    public InviteToJoinCourse(input: CourseServiceAdapterInput): Promise<resp<String | undefined>> {
        return courseRequestAdapterService.inviteToJoinCourse(this.normalizeInput(input));
    }

    public getFirstTemplateByCourseID(input: CourseServiceAdapterInput): Promise<resp<String | { template_id: string } | undefined>> {
        return courseRequestAdapterService.getFirstTemplateByCourseID(this.normalizeInput(input));
    }

    public getAllCourses(): Promise<resp<String | CourseInfo[] | undefined>> {
        return courseRequestAdapterService.listAllCourses();
    }

    public getAllSubmittedCourses(): Promise<resp<String | CourseInfo[] | undefined>> {
        return courseRequestAdapterService.listSubmittedCourses();
    }

    public submitCourse(input: CourseServiceAdapterInput): Promise<resp<String | undefined>> {
        return courseRequestAdapterService.submitCourse(this.normalizeInput(input));
    }

    public setCourseStatus(input: CourseServiceAdapterInput): Promise<resp<String | undefined>> {
        return courseRequestAdapterService.setCourseStatus(this.normalizeInput(input));
    }

    private async withoutAuth<T>(logContext: string, handler: () => Promise<resp<T | undefined>>): Promise<resp<T | undefined>> {
        try {
            return handler();
        } catch (err) {
            logger.error(`Error in ${logContext}:`, err);
            return createResponse(500, "Internal Server Error");
        }
    }

    private normalizeInput(input: CourseServiceAdapterInput): Required<CourseServiceAdapterInput> {
        return {
            user: input.user,
            params: input.params ?? {},
            body: input.body ?? {},
            query: input.query ?? {}
        };
    }
}
