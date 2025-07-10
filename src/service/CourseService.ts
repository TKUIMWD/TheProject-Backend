import { Service } from "../abstract/Service";
import { Chapter } from "../interfaces/Chapter";
import { Class } from "../interfaces/Class";
import { Course } from "../interfaces/Course";
import { CoursePageDTO } from "../interfaces/CoursePageDTO";
import { getUserFromRequest } from "../utils/auth";
import { resp } from "../utils/resp";
import { Request } from "express";
import { logger } from "../middlewares/log";
import { CourseModel } from "../orm/schemas/CourseSchemas";
import { ClassModel } from "../orm/schemas/ClassSchemas";
import { ChapterModel } from "../orm/schemas/ChapterSchemas";
import { addAbortSignal } from "stream";
import { UsersModel } from "../orm/schemas/UserSchemas";
import mongoose from "mongoose";
import { User } from "../interfaces/User";

export class CourseService extends Service {
    /**
     * @param Request
     * @returns resp<Class | undefined>
     */
    public async getClassById(Request: Request): Promise<resp<Class | undefined>> {
        const resp: resp<Class | undefined> = {
            code: 200,
            message: "",
            body: undefined
        };
        try {
            const { class_id } = Request.params;
            if (!class_id || !class_id.match(/^[0-9a-fA-F]{24}$/)) {
                resp.code = 400;
                resp.message = "Invalid class_id format";
                return resp;
            }

            const classData = await ClassModel.findById(class_id);
            if (!classData) {
                resp.code = 404;
                resp.message = "Class not found";
                return resp;
            }

            resp.message = "Class retrieved successfully";
            resp.body = classData;
        } catch (err) {
            resp.code = 500;
            resp.message = "Internal Server Error";
            logger.error("Error in getClassById:", err);
            console.error("Error in getClassById:", err);
        }
        return resp;
    }

    /**
     * @param Request
     * @returns resp<Chapter | undefined>
     */
    public async getChapterById(Request: Request): Promise<resp<Chapter | undefined>> {
        const resp: resp<Chapter | undefined> = {
            code: 200,
            message: "",
            body: undefined
        };
        return resp;
    }

    /**
     * @param Request
     * @returns resp<CoursePageDTO | undefined>
     */
    public async getCoursePageDTO(Request: Request): Promise<resp<CoursePageDTO | undefined>> {
        const resp: resp<CoursePageDTO | undefined> = {
            code: 200,
            message: "",
            body: undefined
        };
        try {
            const user = await getUserFromRequest(Request);
            if (!user) {
                resp.code = 400;
                resp.message = "Unauthorized access";
                return resp;
            }

            const { course_id } = Request.query as { course_id: string };
            if (!course_id || !course_id.match(/^[0-9a-fA-F]{24}$/)) {
                resp.code = 400;
                resp.message = "Invalid course_id format";
                return resp;
            }

            const isAuthorized = user.course_ids.some(id => id.toString() === course_id);
            
            if (!isAuthorized) {
                resp.code = 403;
                resp.message = "You are not authorized to view this course";
                return resp;
            }

            const aggregationResult = await CourseModel.aggregate([

                { $match: { _id: new mongoose.Types.ObjectId(course_id) } },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'submitter_user_id',
                        foreignField: '_id',
                        as: 'submitterInfo'
                    }
                },
                { $unwind: { path: "$submitterInfo", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: 'classes',
                        localField: 'class_ids',
                        foreignField: '_id',
                        as: 'classInfo',
                        pipeline: [
                            {
                                $lookup: {
                                    from: 'chapters',
                                    localField: 'chapter_ids',
                                    foreignField: '_id',
                                    as: 'chapterInfo',
                                    pipeline: [
                                        {
                                            $project: {
                                                _id: 0,
                                                chapter_order: '$chapter_order',
                                                chapter_name: '$chapter_name'
                                            }
                                        }
                                    ]
                                }
                            },

                            {
                                $project: {
                                    _id: 0,
                                    class_order: '$class_order',
                                    class_name: '$class_name',
                                    chapter_titles: '$chapterInfo'
                                }
                            }
                        ]
                    }
                },
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
                        course_submitter_username: '$submitterInfo.username',
                        course_submitter_email: '$submitterInfo.email',
                        course_submitter_avatar_path: '$submitterInfo.avatar_path',
                        class_titles: '$classInfo'
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
            logger.error("Error in getCoursePageDTO:", err);
            console.error("Error in getCoursePageDTO:", err);
        }
        return resp;
    }

    // getReviewByCourseId(Request: Request)
}