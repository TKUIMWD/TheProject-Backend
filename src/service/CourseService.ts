import { Service } from "../abstract/Service";
import { CoursePageDTO } from "../interfaces/Course/CoursePageDTO";
import { validateTokenAndGetAdminUser, validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { resp, createResponse } from "../utils/resp";
import { Request } from "express";
import { logger } from "../middlewares/log";
import { CourseMenu } from "../interfaces/Course/CourseMenu";
import { CourseInfo } from "../interfaces/Course/Course";
import { validateObjectIdInput } from "../modules/common/ObjectIdPolicy";
import { courseReviewService } from "../modules/courses/CourseReviewService";
import { courseLifecycleService } from "../modules/courses/CourseLifecycleService";
import { courseListService } from "../modules/courses/CourseListService";
import { courseMembershipService } from "../modules/courses/CourseMembershipService";
import { courseMutationService } from "../modules/courses/CourseMutationService";
import { courseReadService } from "../modules/courses/CourseReadService";

function validateCourseIdFormat(value: unknown): { valid: true; value: string } | { valid: false; message: string } {
    const result = validateObjectIdInput(value, "course_id");
    return result.valid ? result : { valid: false, message: "Invalid course_id format" };
}

export class CourseService extends Service {
    /**
     * @description Get course page data by course id.
     * @param Request
     * @returns resp<CoursePageDTO | undefined>
     */
    public async getCourseById(Request: Request): Promise<resp<CoursePageDTO | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<undefined>(Request);
            if (error) {
                return error;
            }

            return courseReadService.getCoursePage({ user, courseId: Request.params.courseId });

        } catch (err) {
            logger.error("Error in getCourseById:", err);
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * @description Get course menu data by course id.
     * @param Request
     * @returns resp<CourseMenu | undefined>
     */
    public async getCourseMenu(Request: Request): Promise<resp<CourseMenu | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<undefined>(Request);
            if (error) {
                return error;
            }

            return courseReadService.getCourseMenu({ user, courseId: Request.params.courseId });

        } catch (err) {
            logger.error("Error in getCourseMenu:", err);
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * @description Add a new course.
     * @param Request Express request object.
     * @returns A promise resolving to the created course or an error response.
     */
    public async AddCourse(Request: Request): Promise<resp<String | { course_id: String } | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<String>(Request)
            if (error) {
                return error;
            }

            return courseMutationService.createCourse({
                user,
                request: Request.body
            });
        } catch (err) {
            logger.error("Error in AddCourse:", err);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async UpdateCourseById(Request: Request): Promise<resp<String | { course_id: string } | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<String>(Request);
            if (error) {
                return error;
            }

            const courseIdResult = validateCourseIdFormat(Request.params.courseId);
            if (!courseIdResult.valid) {
                return createResponse(400, courseIdResult.message);
            }
            const courseId = courseIdResult.value;

            return courseMutationService.updateCourse({
                user,
                courseId,
                request: Request.body
            });
        }
        catch (err) {
            logger.error("Error in UpdateCourseById:", err);
            return createResponse(500, "Internal Server Error");
        }
    }

    // 刪除課程（包含class, chapter 都會刪除）
    public async DeleteCourseById(Request: Request): Promise<resp<String | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<String>(Request)
            if (error) {
                return error;
            }

            const courseIdResult = validateCourseIdFormat(Request.params.courseId);
            if (!courseIdResult.valid) {
                return createResponse(400, courseIdResult.message);
            }
            const courseId = courseIdResult.value;

            return courseMutationService.deleteCourse(courseId);

        } catch (err) {
            logger.error("Error in DeleteCourseById:", err);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async GetAllPublicCourses(Request: Request): Promise<resp<String | CourseInfo[] | undefined>> {
        try {
            return courseListService.listPublicCourses();
        } catch (error) {
            logger.error("Error in GetAllPublicCourse:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async JoinCourseById(Request: Request): Promise<resp<String | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<String>(Request);
            if (error) {
                return error;
            }

            const courseIdResult = validateCourseIdFormat(Request.params.courseId);
            if (!courseIdResult.valid) {
                return createResponse(400, courseIdResult.message);
            }
            const courseId = courseIdResult.value;

            return courseMembershipService.joinCourse({ user, courseId });
        } catch (err) {
            logger.error("Error in JoinCourseById:", err);
            return createResponse(500, "Internal Server Error");
        }

    }

    public async rateCourse(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetUser<any>(Request);
            if (error) {
                return error;
            }

            return courseReviewService.createReview({
                user,
                request: Request.body
            });
        } catch (err) {
            logger.error("Error in rateCourse:", err);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async getCourseReviews(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetUser<any>(Request);
            if (error) {
                return error;
            }

            return courseReviewService.listReviews({
                user,
                request: Request.query
            });
        } catch (err) {
            logger.error("Error in getCourseReviews:", err);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async updateCourseReview(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetUser<any>(Request);
            if (error) {
                return error;
            }

            const { review_id } = Request.params;
            return courseReviewService.updateReview({
                user,
                request: {
                    ...Request.body,
                    review_id
                }
            });
        } catch (err) {
            logger.error("Error in updateCourseReview:", err);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async deleteCourseReview(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetUser<any>(Request);
            if (error) {
                return error;
            }

            const { review_id } = Request.params;
            return courseReviewService.deleteReview({
                user,
                request: {
                    ...Request.query,
                    review_id
                }
            });
        } catch (err) {
            logger.error("Error in deleteCourseReview:", err);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async ApprovedCourseById(Request: Request): Promise<resp<String | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<String>(Request);
            if (error) {
                return error;
            }

            const courseIdResult = validateCourseIdFormat(Request.params.courseId);
            if (!courseIdResult.valid) {
                return createResponse(400, courseIdResult.message);
            }
            const courseId = courseIdResult.value;

            return courseLifecycleService.approveCourse({
                courseId,
                actorUserId: user._id.toString()
            });

        } catch (err) {
            logger.error("Error in ApprovedCourseById:", err);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async UnApprovedCourseById(Request: Request): Promise<resp<String | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<String>(Request);
            if (error) {
                return error;
            }

            const courseIdResult = validateCourseIdFormat(Request.params.courseId);
            if (!courseIdResult.valid) {
                return createResponse(400, courseIdResult.message);
            }
            const courseId = courseIdResult.value;

            return courseLifecycleService.unapproveCourse({
                courseId,
                actorUserId: user._id.toString()
            });

        } catch (err) {
            logger.error("Error in UnApprovedCourseById:", err);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async InviteToJoinCourse(Request: Request): Promise<resp<String | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<String>(Request);
            if (error) {
                return error;
            }
            return courseMembershipService.inviteUsers({
                actor: user,
                request: Request.body
            });
        } catch (err) {
            logger.error("Error in InviteToJoinCourse:", err);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async getFirstTemplateByCourseID(Request: Request): Promise<resp<String | { template_id: string } | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<String | { template_id: string }>(Request);
            if (error) {
                return error;
            }

            return courseReadService.getFirstTemplate({ user, courseId: Request.params.courseId });
        } catch (err) {
            logger.error("Error in getFirstTemplateByCourseID:", err);
            return createResponse(500, "Internal Server Error");
        }
    }

    // superadmin only
    // get all courses (for management)
    public async getAllCourses(Request: Request): Promise<resp<String | CourseInfo[] | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<String>(Request);
            if (error) {
                return error;
            }

            return courseListService.listAllCourses();
        } catch (error) {
            logger.error("Error in GetAllCourses:", error);
            return createResponse(500, "Internal Server Error");
        }

    }

    // superadmin only
    // 取得所有待審核的課程(status = "審核中")
    public async getAllSubmittedCourses(Request: Request): Promise<resp<String | CourseInfo[] | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<String>(Request);
            if (error) {
                return error;
            }

            return courseListService.listSubmittedCourses();
        } catch (error) {
            logger.error("Error in GetAllPendingCourses:", error);
            return createResponse(500, "Internal Server Error");
        }

    }

    public async submitCourse(Request: Request): Promise<resp<String | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<String>(Request);
            if (error) {
                return error;
            }

            const { courseId } = Request.body;
            const courseIdResult = validateCourseIdFormat(courseId);
            if (!courseIdResult.valid) {
                return createResponse(400, courseIdResult.message);
            }
            const normalizedCourseId = courseIdResult.value;

            return courseLifecycleService.submitCourse({
                courseId: normalizedCourseId,
                actorUserId: user._id.toString()
            });

        } catch (err) {
            logger.error("Error in submitCourse:", err);
            return createResponse(500, "Internal Server Error");
        }
    }

    // set course status (公開、未公開) (admin only)
    public async setCourseStatus(Request: Request): Promise<resp<String | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<String>(Request);
            if (error) {
                return error;
            }

            const { courseId, status } = Request.body;
            const courseIdResult = validateCourseIdFormat(courseId);
            if (!courseIdResult.valid) {
                return createResponse(400, courseIdResult.message);
            }
            const normalizedCourseId = courseIdResult.value;

            return courseLifecycleService.setVisibility({
                courseId: normalizedCourseId,
                status,
                actorUserId: user._id.toString()
            });

        } catch (err) {
            logger.error("Error in setCourseStatus:", err);
            return createResponse(500, "Internal Server Error");
        }
    }
}
