import { Service } from "../abstract/Service";
import { CoursePageDTO } from "../interfaces/Course/CoursePageDTO";
import { validateTokenAndGetUser } from "../utils/auth";
import { resp, createResponse } from "../utils/resp";
import { Request } from "express";
import { logger } from "../middlewares/log";
import { CourseModel } from "../orm/schemas/CourseSchemas";
import mongoose from "mongoose";
import { CourseMenu } from "../interfaces/Course/CourseMenu";
import { UsersModel } from "../orm/schemas/UserSchemas";
import { ChapterModel } from "../orm/schemas/ChapterSchemas";
import { Course } from "../interfaces/Course/Course";
import { ClassModel } from "../orm/schemas/ClassSchemas";

export class CourseService extends Service {
    /**
     * @description Auth Request and return course document.
     * @param Request Express request object.
     * @returns A promise resolving to the course document or an error response.
     */
    private async _getAuthorizedCourse(Request: Request): Promise<
        { success: true; course: Course } |
        { success: false; errorResp: resp<undefined> }
    > {
        const { user, error } = await validateTokenAndGetUser<undefined>(Request);
        if (error) {
            return { success: false, errorResp: error };
        }

        const { courseId } = Request.params;
        if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
            return { success: false, errorResp: createResponse(400, "Invalid course_id format") };
        }

        const isAuthorized = user.course_ids.some((id: any) => id.toString() === courseId);
        if (!isAuthorized) {
            return { success: false, errorResp: createResponse(403, "You are not authorized to view this course") };
        }

        const course = await CourseModel.findById(courseId).lean();
        if (!course) {
            return { success: false, errorResp: createResponse(404, "Course not found") };
        }

        return { success: true, course };
    }

    /**
     * @description Get course page data by course id.
     * @param Request
     * @returns resp<CoursePageDTO | undefined>
     */
    public async getCourseById(Request: Request): Promise<resp<CoursePageDTO | undefined>> {
        try {
            const authResult = await this._getAuthorizedCourse(Request);
            if (!authResult.success) {
                return authResult.errorResp;
            }
            
            const { course } = authResult;
            const submitter = await UsersModel.findById(course.submitter_user_id).lean();
            if (!submitter) {
                return createResponse(404, "Submitter not found");
            }
            
            const courseData: CoursePageDTO = {
                course_name: course.course_name,
                course_subtitle: course.course_subtitle,
                course_description: course.course_description,
                course_duration_in_minutes: course.duration_in_minutes,
                course_difficulty: course.difficulty as "Easy" | "Medium" | "Hard",
                course_rating: course.rating,
                course_reviews: course.reviews,
                submitterInfo: {
                    username: submitter.username,
                    email: submitter.email,
                    avatar_path: submitter.avatar_path
                }
            };

            return createResponse(200, "Course page data retrieved successfully", courseData);

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
            const authResult = await this._getAuthorizedCourse(Request);
            if (!authResult.success) {
                return authResult.errorResp;
            }

            const { course } = authResult;
            const classes = await ClassModel.find({ _id: { $in: course.class_ids } }).lean();
            if (!classes || classes.length === 0) {
                return createResponse(404, "No classes found for this course");
            }

            const allChapterIds = classes.flatMap(c => c.chapter_ids);
            const chapters = await ChapterModel.find({ _id: { $in: allChapterIds } }).lean();
            const chapterMap = new Map(chapters.map(ch => [ch._id.toString(), ch]));

            const classTitles = classes.map(c => ({
                class_id: c._id,
                class_order: c.class_order,
                class_name: c.class_name,
                chapter_titles: c.chapter_ids
                    .map(id => chapterMap.get(id.toString()))
                    .filter((ch): ch is NonNullable<typeof ch> => Boolean(ch)) // 過濾掉因某些原因找不到的 chapter
                    .map(ch => ({
                        chapter_id: ch._id,
                        chapter_order: ch.chapter_order,
                        chapter_name: ch.chapter_name
                    }))
            }));

            const courseMenuData: CourseMenu = {
                class_titles: classTitles
            };

            return createResponse(200, "Course menu data retrieved successfully", courseMenuData);

        } catch (err) {
            logger.error("Error in getCourseMenu:", err);
            return createResponse(500, "Internal Server Error");
        }
    }
}