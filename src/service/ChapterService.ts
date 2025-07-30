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

            const parentClass = await ClassModel.findOne({ _id: chapter.class_id }).lean();
            if (!parentClass) {
                return createResponse(404, "Could not find parent class for this chapter");
            }

            // 使用者無權訪問包含此章節的課程
            const parentCourse = await CourseModel.findOne({_id: chapter.course_id}).lean();
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

    public async AddChapterToClass(Request: Request): Promise<resp<String | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<String>(Request);
            if (error) {
                return error;
            }

            const { classId } = Request.params;
            if (!classId || !mongoose.Types.ObjectId.isValid(classId)) {
                return createResponse(400, "Invalid class_id format");
            }

            const classData = await ClassModel.findById(classId).lean();
            if (!classData) {
                return createResponse(404, "Class not found");
            }

            const { chapter_name, chapter_subtitle, chapter_content, chapter_order } = Request.body;
            const requiredFields = ["chapter_name", "chapter_subtitle", "chapter_content", "chapter_order"];
            const missingFields = requiredFields.filter(field => !Request.body[field]);
            if (missingFields.length > 0) {
                return createResponse(400, `Missing required fields: ${missingFields.join(", ")}`);
            }

            if (typeof chapter_order !== "number" || chapter_order < 0) {
                return createResponse(400, "chapter_order must be a non-negative number");
            }

            // 檢查章節名稱是否已存在於同一課程中
            const existingChapter = await ChapterModel.findOne({
                class_id: classId,
                chapter_name: chapter_name
            }).lean();
            if (existingChapter) {
                return createResponse(400, "Chapter with this name already exists in the class");
            }

            // 確認是課程擁有者的操作
            const course = await CourseModel.findById(classData.course_id).lean();
            if (!course) {
                return createResponse(404, "Course not found");
            }

            if (user._id.toString() !== course.submitter_user_id.toString()) {
                return createResponse(403, "You are not authorized to add classes to this course");
            }

            // 創建新的章節
            const newChapter = new ChapterModel({
                chapter_name,
                chapter_subtitle,
                chapter_order,
                class_id: classId,
                course_id: classData.course_id,
                has_approved_content: "",
                waiting_for_approve_content: chapter_content,
                saved_content: ""
            });

            await newChapter.save();

            // 更新課程的章節列表
            classData.chapter_ids.push(newChapter._id);
            await ClassModel.findByIdAndUpdate(classId, { chapter_ids: classData.chapter_ids });

            return createResponse(200, "Chapter added successfully", String(newChapter._id));
        } catch (error) {
            logger.error("Error in AddChapterToClass:", error);
            return createResponse(500, "Internal Server Error");
        }
    }
}