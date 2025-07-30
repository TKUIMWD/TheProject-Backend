import mongoose from "mongoose";
import { Service } from "../abstract/Service";
import { ChapterPageDTO } from "../interfaces/Chapter/ChapterPageDTO";
import { ChapterModel } from "../orm/schemas/ChapterSchemas";
import { validateTokenAndGetAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { resp, createResponse } from "../utils/resp"
import { Request } from "express";
import { logger } from "../middlewares/log";
import { ClassMap } from "../interfaces/Course/Maps";
import { CourseModel } from "../orm/schemas/CourseSchemas";
import { ClassModel } from "../orm/schemas/ClassSchemas";

export class ChapterService extends Service {
    /**
     * @param Request
     * @returns resp<ChapterPageDTO | undefined>
     */
    public async getChapterById(Request: Request): Promise<resp<ChapterPageDTO | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<ChapterPageDTO>(Request);
            if (error) {
                return error;
            }

            const { chapterId } = Request.params;
            if (!chapterId || !mongoose.Types.ObjectId.isValid(chapterId)) {
                return createResponse(400, "Invalid chapter_id format");
            }

            const chapter = await ChapterModel.findById(chapterId).lean();
            if (!chapter) {
                return createResponse(404, "Chapter not found");
            }

            const parentClass = await ClassModel.findOne({ chapter_ids: chapterId }).lean();
            if (!parentClass) {
                return createResponse(404, "Could not find parent class for this chapter");
            }

            const userCourseObjectIds = user.course_ids.map((id: any) => new mongoose.Types.ObjectId(id.toString()));

            const parentCourse = await CourseModel.findOne({
                _id: { $in: userCourseObjectIds },
                class_ids: { $in: [parentClass._id] }
            }).lean();

            // 使用者無權訪問包含此章節的課程
            if (!parentCourse) {
                return createResponse(403, "You are not authorized to view this chapter.");
            }

            const chapterData: ChapterPageDTO = {
                course_id: parentCourse._id,
                course_name: parentCourse.course_name,
                class_id: parentClass._id,
                class_name: parentClass.class_name,
                chapter_id: chapter._id,
                chapter_name: chapter.chapter_name,
                chapter_subtitle: chapter.chapter_subtitle,
                chapter_order: chapter.chapter_order,
                chapter_content: chapter.has_approved_content
            };

            return createResponse(200, "Chapter data retrieved successfully", chapterData);

        } catch (err) {
            logger.error("Error in getChapterById:", err);
            console.error("Error in getChapterById:", err);
            return createResponse(500, "Internal Server Error");
        }
    }
}