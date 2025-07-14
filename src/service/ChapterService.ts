import mongoose from "mongoose";
import { Service } from "../abstract/Service";
import { ChapterPageDTO } from "../interfaces/Chapter/ChapterPageDTO";
import { ChapterModel } from "../orm/schemas/ChapterSchemas";
import { getUserFromRequest } from "../utils/auth";
import { resp } from "../utils/resp"
import { Request } from "express";
import { logger } from "../middlewares/log";
import { ClassMap } from "../interfaces/Course/Maps";
import { CourseModel } from "../orm/schemas/CourseSchemas";

export class ChapterService extends Service {
    /**
     * @param Request
     * @returns resp<ChapterPageDTO | undefined>
     */
    public async getChapterById(Request: Request): Promise<resp<ChapterPageDTO | undefined>> {
        const resp: resp<ChapterPageDTO | undefined> = {
            code: 200,
            message: "",
            body: undefined
        };
        try {
            const user = await getUserFromRequest(Request);
            if (!user) {
                resp.code = 401;
                resp.message = "Unauthorized access";
                return resp;
            }

            const { chapterId } = Request.params;
            if (!chapterId || !mongoose.Types.ObjectId.isValid(chapterId)) {
                resp.code = 400;
                resp.message = "Invalid chapter_id format";
                return resp;
            }

            const targetChapterId = new mongoose.Types.ObjectId(chapterId);

            const aggregationResult = await CourseModel.aggregate([
                {
                    $match: {
                        _id: {
                            $in: user.course_ids.map(id => new mongoose.Types.ObjectId(id.toString()))
                        }
                    }
                },
                {
                    $lookup: {
                        from: 'classes',
                        let: { class_ids_str: '$class_ids' },
                        pipeline: [
                            { $match: { $expr: { $in: ['$_id', { $map: { input: '$$class_ids_str', as: 'id_str', in: { $toObjectId: '$$id_str' } } }] } } }
                        ],
                        as: 'classInfo'
                    }
                },
                { $unwind: '$classInfo' },
                {
                    $match: {
                        'classInfo.chapter_ids': { $in: [chapterId] }
                    }
                },
                {
                    $lookup: {
                        from: 'chapters',
                        pipeline: [
                            { $match: { _id: targetChapterId } }
                        ],
                        as: 'chapterInfo'
                    }
                },
                { $unwind: '$chapterInfo' },
                {
                    $project: {
                        _id: 0,
                        course_id: '$_id',
                        course_name: '$course_name',
                        class_id: '$classInfo._id',
                        class_name: '$classInfo.class_name',
                        chapter_id: '$chapterInfo._id',
                        chapter_name: '$chapterInfo.chapter_name',
                        chapter_subtitle: '$chapterInfo.chapter_subtitle',
                        chapter_order: '$chapterInfo.chapter_order',
                        chapter_content: '$chapterInfo.has_approved_content'
                    }
                }
            ]);

            if (aggregationResult.length === 0) {
                resp.code = 403;
                resp.message = "You are not authorized to view this chapter, or the chapter does not exist.";
                return resp;
            }

            resp.body = aggregationResult[0] as ChapterPageDTO;
            resp.message = "Chapter data retrieved successfully";


        } catch (err) {
            resp.code = 500;
            resp.message = "Internal Server Error";
            logger.error("Error in getChapterPageDTO:", err);
            console.error("Error in getChapterPageDTO:", err);
        }

        return resp;
    }
}