import { Service } from "../abstract/Service";
import { CoursePageDTO } from "../interfaces/Course/CoursePageDTO";
import { getUserFromRequest } from "../utils/auth";
import { resp } from "../utils/resp";
import { Request } from "express";
import { logger } from "../middlewares/log";
import { CourseModel } from "../orm/schemas/CourseSchemas";
import mongoose from "mongoose";
import { CourseMenu } from "../interfaces/Course/CourseMenu";
import { UsersModel } from "../orm/schemas/UserSchemas";

export class CourseService extends Service {
    /**
     * Validates the course access for the user.
     * @param Request - The Express request object.
     * @returns An object containing courseId if valid, or an error response.
     */
    private async _validateCourseAccess(Request: Request): Promise<{ courseId?: string; errorResp?: resp<undefined> }> {
        const user = await getUserFromRequest(Request);
        if (!user) {
            return { errorResp: { code: 401, message: "Unauthorized access", body: undefined } };
        }

        const { courseId } = Request.params;
        if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
            return { errorResp: { code: 400, message: "Invalid course_id format", body: undefined } };
        }

        const isAuthorized = user.course_ids.some(id => id.toString() === courseId);
        if (!isAuthorized) {
            return { errorResp: { code: 403, message: "You are not authorized to view this course", body: undefined } };
        }

        return { courseId };
    }

    /**
     * @param Request
     * @returns resp<CoursePageDTO | undefined>
     */
    public async getCourseById(Request: Request): Promise<resp<CoursePageDTO | undefined>> {
        const resp: resp<CoursePageDTO | undefined> = {
            code: 200,
            message: "",
            body: undefined
        };
        try {
            const validationResult = await this._validateCourseAccess(Request);
            if (validationResult.errorResp) {
                return validationResult.errorResp;
            }
            const { courseId } = validationResult;

            const aggregationResult = await CourseModel.aggregate([
                { $match: { _id: new mongoose.Types.ObjectId(courseId) } },
                {
                    $lookup: {
                        from: 'users',
                        // 修正：在查詢前，將 localField 的字串轉為 ObjectId
                        let: { submitter_id_str: '$submitter_user_id' },
                        pipeline: [
                            { $match: { $expr: { $eq: ['$_id', { $toObjectId: '$$submitter_id_str' }] } } }
                        ],
                        as: 'submitterInfo'
                    }
                },
                { $unwind: { path: "$submitterInfo", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 0,
                        course_name: '$course_name',
                        course_subtitle: '$course_subtitle',
                        course_description: '$course_description',
                        course_duration_in_minutes: '$duration_in_minutes',
                        course_difficulty: '$difficulty',
                        course_rating: '$rating',
                        course_reviews: '$reviews',
                        submitterInfo: {
                            username: '$submitterInfo.username',
                            email: '$submitterInfo.email',
                            avatar_path: '$submitterInfo.avatar_path'
                        },
                    }
                }
            ]);

            if (!aggregationResult || aggregationResult.length === 0) {
                resp.code = 404;
                resp.message = "Course not found";
                return resp;
            }

            resp.body = aggregationResult[0] as CoursePageDTO;
            resp.message = "Course page data retrieved successfully";

        } catch (err) {
            resp.code = 500;
            resp.message = "Internal Server Error";
            logger.error("Error in getCourseById:", err);
            console.error("Error in getCourseById:", err);
        }
        return resp;
    }

    /**
     * @param Request
     * @returns resp<CourseMenu | undefined>
     */
    public async getCourseMenu(Request: Request): Promise<resp<CourseMenu | undefined>> {
        const resp: resp<CourseMenu | undefined> = {
            code: 200,
            message: "",
            body: undefined
        };

        try {
            const validationResult = await this._validateCourseAccess(Request);
            if (validationResult.errorResp) {
                return validationResult.errorResp;
            }
            const { courseId } = validationResult;

            const aggregationResult = await CourseModel.aggregate([
                { $match: { _id: new mongoose.Types.ObjectId(courseId) } },
                {
                    $lookup: {
                        from: 'classes',
                        let: { class_ids_str: '$class_ids' },
                        pipeline: [
                            { $match: { $expr: { $in: ['$_id', { $map: { input: '$$class_ids_str', as: 'id_str', in: { $toObjectId: '$$id_str' } } }] } } },
                            {
                                $lookup: {
                                    from: 'chapters',
                                    let: { chapter_ids_str: '$chapter_ids' },
                                    pipeline: [
                                        { $match: { $expr: { $in: ['$_id', { $map: { input: '$$chapter_ids_str', as: 'id_str', in: { $toObjectId: '$$id_str' } } }] } } },
                                        {
                                            $project: {
                                                _id: 0,
                                                chapter_id: '$_id',
                                                chapter_order: '$chapter_order',
                                                chapter_name: '$chapter_name'
                                            }
                                        }
                                    ],
                                    as: 'chapterInfo'
                                }
                            },
                            {
                                $project: {
                                    _id: 0,
                                    class_id: '$_id',
                                    class_order: '$class_order',
                                    class_name: '$class_name',
                                    chapter_titles: '$chapterInfo'
                                }
                            }
                        ],
                        as: 'classInfo'
                    }
                },
                {
                    $project: {
                        _id: 0,
                        course_name: '$course_name',
                        class_titles: '$classInfo'
                    }
                }
            ]);

            if (!aggregationResult || aggregationResult.length === 0) {
                resp.code = 404;
                resp.message = "Course not found";
                return resp;
            }

            resp.body = aggregationResult[0] as CourseMenu;
            resp.message = "Course menu data retrieved successfully";

        } catch (err) {
            resp.code = 500;
            resp.message = "Internal Server Error";
            logger.error("Error in getCourseMenu:", err);
            console.error("Error in getCourseMenu:", err);
        }

        return resp;
    }
}