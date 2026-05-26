import { CourseInfo } from "../../interfaces/Course/Course";
import { CourseMenu } from "../../interfaces/Course/CourseMenu";
import { CoursePageDTO } from "../../interfaces/Course/CoursePageDTO";
import { createResponse, resp } from "../../utils/resp";
import { validateObjectIdInput } from "../common/ObjectIdPolicy";
import { courseLifecycleService } from "./CourseLifecycleService";
import { courseListService } from "./CourseListService";
import { courseMembershipService } from "./CourseMembershipService";
import { courseMutationService } from "./CourseMutationService";
import { courseReadService } from "./CourseReadService";
import { courseReviewService } from "./CourseReviewService";

type CourseAdapterInput = {
    user: any;
    params?: Record<string, any>;
    body?: any;
    query?: any;
};

type CourseRequestAdapterServiceDeps = {
    read?: typeof courseReadService;
    mutation?: typeof courseMutationService;
    list?: typeof courseListService;
    membership?: typeof courseMembershipService;
    review?: typeof courseReviewService;
    lifecycle?: typeof courseLifecycleService;
};

function validateCourseIdFormat(value: unknown): { valid: true; value: string } | { valid: false; message: string } {
    const result = validateObjectIdInput(value, "course_id");
    return result.valid ? result : { valid: false, message: "Invalid course_id format" };
}

export class CourseRequestAdapterService {
    private readonly read: NonNullable<CourseRequestAdapterServiceDeps["read"]>;
    private readonly mutation: NonNullable<CourseRequestAdapterServiceDeps["mutation"]>;
    private readonly list: NonNullable<CourseRequestAdapterServiceDeps["list"]>;
    private readonly membership: NonNullable<CourseRequestAdapterServiceDeps["membership"]>;
    private readonly review: NonNullable<CourseRequestAdapterServiceDeps["review"]>;
    private readonly lifecycle: NonNullable<CourseRequestAdapterServiceDeps["lifecycle"]>;

    constructor(deps: CourseRequestAdapterServiceDeps = {}) {
        this.read = deps.read ?? courseReadService;
        this.mutation = deps.mutation ?? courseMutationService;
        this.list = deps.list ?? courseListService;
        this.membership = deps.membership ?? courseMembershipService;
        this.review = deps.review ?? courseReviewService;
        this.lifecycle = deps.lifecycle ?? courseLifecycleService;
    }

    public getCourseById(input: CourseAdapterInput): Promise<resp<CoursePageDTO | undefined>> {
        return this.read.getCoursePage({ user: input.user, courseId: input.params?.courseId });
    }

    public getCourseMenu(input: CourseAdapterInput): Promise<resp<CourseMenu | undefined>> {
        return this.read.getCourseMenu({ user: input.user, courseId: input.params?.courseId });
    }

    public addCourse(input: CourseAdapterInput): Promise<resp<String | { course_id: String } | undefined>> {
        return this.mutation.createCourse({ user: input.user, request: input.body });
    }

    public updateCourseById(input: CourseAdapterInput): Promise<resp<String | { course_id: string } | undefined>> {
        const courseIdResult = validateCourseIdFormat(input.params?.courseId);
        if (!courseIdResult.valid) {
            return Promise.resolve(createResponse(400, courseIdResult.message));
        }

        return this.mutation.updateCourse({
            user: input.user,
            courseId: courseIdResult.value,
            request: input.body
        });
    }

    public deleteCourseById(input: CourseAdapterInput): Promise<resp<String | undefined>> {
        const courseIdResult = validateCourseIdFormat(input.params?.courseId);
        if (!courseIdResult.valid) {
            return Promise.resolve(createResponse(400, courseIdResult.message));
        }

        return this.mutation.deleteCourse(courseIdResult.value);
    }

    public listPublicCourses(): Promise<resp<String | CourseInfo[] | undefined>> {
        return this.list.listPublicCourses();
    }

    public joinCourseById(input: CourseAdapterInput): Promise<resp<String | undefined>> {
        const courseIdResult = validateCourseIdFormat(input.params?.courseId);
        if (!courseIdResult.valid) {
            return Promise.resolve(createResponse(400, courseIdResult.message));
        }

        return this.membership.joinCourse({ user: input.user, courseId: courseIdResult.value });
    }

    public rateCourse(input: CourseAdapterInput): Promise<resp<any>> {
        return this.review.createReview({ user: input.user, request: input.body });
    }

    public getCourseReviews(input: CourseAdapterInput): Promise<resp<any>> {
        return this.review.listReviews({ user: input.user, request: input.query });
    }

    public updateCourseReview(input: CourseAdapterInput): Promise<resp<any>> {
        return this.review.updateReview({
            user: input.user,
            request: {
                ...input.body,
                review_id: input.params?.review_id
            }
        });
    }

    public deleteCourseReview(input: CourseAdapterInput): Promise<resp<any>> {
        return this.review.deleteReview({
            user: input.user,
            request: {
                ...input.query,
                review_id: input.params?.review_id
            }
        });
    }

    public approveCourseById(input: CourseAdapterInput): Promise<resp<String | undefined>> {
        const courseIdResult = validateCourseIdFormat(input.params?.courseId);
        if (!courseIdResult.valid) {
            return Promise.resolve(createResponse(400, courseIdResult.message));
        }

        return this.lifecycle.approveCourse({
            courseId: courseIdResult.value,
            actorUserId: input.user._id.toString()
        });
    }

    public unapproveCourseById(input: CourseAdapterInput): Promise<resp<String | undefined>> {
        const courseIdResult = validateCourseIdFormat(input.params?.courseId);
        if (!courseIdResult.valid) {
            return Promise.resolve(createResponse(400, courseIdResult.message));
        }

        return this.lifecycle.unapproveCourse({
            courseId: courseIdResult.value,
            actorUserId: input.user._id.toString()
        });
    }

    public inviteToJoinCourse(input: CourseAdapterInput): Promise<resp<String | undefined>> {
        return this.membership.inviteUsers({ actor: input.user, request: input.body });
    }

    public getFirstTemplateByCourseID(input: CourseAdapterInput): Promise<resp<String | { template_id: string } | undefined>> {
        return this.read.getFirstTemplate({ user: input.user, courseId: input.params?.courseId });
    }

    public listAllCourses(): Promise<resp<String | CourseInfo[] | undefined>> {
        return this.list.listAllCourses();
    }

    public listSubmittedCourses(): Promise<resp<String | CourseInfo[] | undefined>> {
        return this.list.listSubmittedCourses();
    }

    public submitCourse(input: CourseAdapterInput): Promise<resp<String | undefined>> {
        const courseIdResult = validateCourseIdFormat(input.body?.courseId);
        if (!courseIdResult.valid) {
            return Promise.resolve(createResponse(400, courseIdResult.message));
        }

        return this.lifecycle.submitCourse({
            courseId: courseIdResult.value,
            actorUserId: input.user._id.toString()
        });
    }

    public setCourseStatus(input: CourseAdapterInput): Promise<resp<String | undefined>> {
        const courseIdResult = validateCourseIdFormat(input.body?.courseId);
        if (!courseIdResult.valid) {
            return Promise.resolve(createResponse(400, courseIdResult.message));
        }

        return this.lifecycle.setVisibility({
            courseId: courseIdResult.value,
            status: input.body?.status,
            actorUserId: input.user._id.toString()
        });
    }
}

export const courseRequestAdapterService = new CourseRequestAdapterService();
