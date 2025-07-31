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
import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';
import { sanitizeString, sanitizeArray } from "../utils/sanitize";

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
            const parentCourse = await CourseModel.findOne({ _id: chapter.course_id }).lean();
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

    public async AddChapterToClass(Request: Request): Promise<resp<String | { chapter_id: string } | undefined>> {
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

            const requestBody = Request.body;
            const requiredFieldKeys = ["chapter_name", "chapter_subtitle", "chapter_content", "chapter_order"];
            const missingKeys = requiredFieldKeys.filter(field => requestBody[field] === undefined);

            if (missingKeys.length > 0) {
                return createResponse(400, `Missing required key(s) in request body: ${missingKeys.join(", ")}`);
            }

            const { chapter_name, chapter_subtitle, chapter_content, chapter_order } = Request.body;
            if (typeof chapter_order !== "number" || chapter_order < 0) {
                return createResponse(400, "chapter_order must be a non-negative number");
            }

            // 確認是課程擁有者的操作
            const course = await CourseModel.findById(classData.course_id).lean();
            if (!course) {
                return createResponse(404, "Course not found");
            }

            if (user._id.toString() !== course.submitter_user_id.toString()) {
                return createResponse(403, "You are not authorized to add classes to this course");
            }

            // 輸入清理
            const sanitizedChapterName = sanitizeString(chapter_name || '');
            if (sanitizedChapterName.trim() === '') {
                return createResponse(400, "chapter_name cannot be empty or strings containing security-sensitive characters");
            }

            const sanitizedSubtitle = sanitizeString(chapter_subtitle || '');
            if (sanitizedSubtitle.trim() === '') {
                return createResponse(400, "chapter_subtitle cannot be empty or strings containing security-sensitive characters");
            }

            const sanitizedContent = sanitizeString(chapter_content || '');
            if (sanitizedContent.trim() === '') {
                return createResponse(400, "chapter_content cannot be empty or strings containing security-sensitive characters");
            }

             // 檢查章節名稱是否已存在於同一課程中
            const existingChapter = await ChapterModel.findOne({
                class_id: classId,
                chapter_name: sanitizedChapterName
            }).lean();
            if (existingChapter) {
                return createResponse(400, "Chapter with this name already exists in the class");
            }

            // 創建新的章節
            const newChapter = new ChapterModel({
                chapter_name: sanitizedChapterName,
                chapter_subtitle: sanitizedSubtitle,
                chapter_order,
                class_id: classId,
                course_id: classData.course_id,
                has_approved_content: "",
                waiting_for_approve_content: sanitizedContent,
                saved_content: ""
            });

            const savedChapter = await newChapter.save();

            // 更新課程的章節列表
            await ClassModel.findByIdAndUpdate(classId, { $push: { chapter_ids: savedChapter._id } });

            logger.info(`Chapter ${newChapter._id} added to class ${classId}`);
            return createResponse(200, "Chapter added successfully", {chapter_id: String(newChapter._id)});
        } catch (error) {
            logger.error("Error in AddChapterToClass:", error);
            return createResponse(500, "Internal Server Error");
        }
    }
}