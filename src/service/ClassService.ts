import mongoose from "mongoose";
import { Request } from "express";
import { Service } from "../abstract/Service";
import { logger } from "../middlewares/log";
import { validateTokenAndGetAdminUser } from "../utils/auth";
import { createResponse, resp } from "../utils/resp";
import { CourseModel } from "../orm/schemas/CourseSchemas";
import { ClassModel } from "../orm/schemas/ClassSchemas";
import { sanitizeString } from "../utils/sanitize";
import { ChapterModel } from "../orm/schemas/ChapterSchemas";

export class ClassService extends Service {

    public async AddClass(Request: Request): Promise<resp<string |{class_id: string}| undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<string>(Request);
            if (error) {
                return error;
            }

            // 檢查請求參數
            const { courseId } = Request.params;
            if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
                return createResponse(400, "Invalid course_id format");
            }

            const course = await CourseModel.findById(courseId);
            if (!course) {
                return createResponse(404, "Course not found");
            }

            // 確認是課程擁有者的操作
            if (user._id.toString() !== course.submitter_user_id.toString()) {
                return createResponse(403, "You are not authorized to add classes to this course");
            }

            const { class_name, class_subtitle, class_order } = Request.body;
            const requiredFields = { class_name, class_subtitle, class_order };
            const missingFields = Object.entries(requiredFields)
                .filter(([_, value]) => value === undefined)
                .map(([key]) => key);
            if (missingFields.length > 0) {
                return createResponse(400, `Missing required fields: ${missingFields.join(', ')}`);
            }

            // 檢查class名稱是否已存在於同一課程中
            const existingClass = await ClassModel.findOne({
                course_id: courseId,
                class_name: class_name
            }).lean();
            if (existingClass) {
                return createResponse(400, "Class with this name already exists in the course");
            }

            const sanitizedClassName = sanitizeString(class_name);
            if (sanitizedClassName.trim() === '') {
                return createResponse(400, "class_name cannot be empty or strings containing security-sensitive characters");
            }

            const sanitizedSubtitle = sanitizeString(class_subtitle);
            if (sanitizedSubtitle.trim() === '') {
                return createResponse(400, "class_subtitle cannot be empty or strings containing security-sensitive characters");
            }

            if (typeof class_order !== "number" || class_order < 0) {
                return createResponse(400, "class_order must be a non-negative number");
            }

            const newClass = new ClassModel({
                course_id: courseId,
                class_name: sanitizedClassName,
                class_subtitle: sanitizedSubtitle,
                class_order,
                chapter_ids: []
            });
            const savedClass = await newClass.save();

            // 將新class的ID添加到課程的class_ids陣列中
            await CourseModel.findByIdAndUpdate(courseId, {
                $push: { class_ids: savedClass._id }
            });

            logger.info(`Class added successfully: ${savedClass._id}`);
            return createResponse(200, "Class added successfully", { class_id: String(savedClass._id) });
        } catch (err) {
            logger.error("Error in AddClass:", err);
            return createResponse(500, "Internal Server Error");
        }

    }

    public async UpdateClassById(Request: Request): Promise<resp<string | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<string>(Request);
            if (error) {
                return error;
            }

            // 檢查請求參數
            const { classId } = Request.params;
            if (!classId || !mongoose.Types.ObjectId.isValid(classId)) {
                return createResponse(400, "Invalid class_id format");
            }

            const classDoc = await ClassModel.findById(classId);
            if (!classDoc) {
                return createResponse(404, "Class not found");
            }

            // 獲取對應的課程以確認權限
            const course = await CourseModel.findById(classDoc.course_id);
            if (!course) {
                return createResponse(404, "Associated course not found");
            }

            // 確認是課程擁有者的操作
            if (user._id.toString() !== course.submitter_user_id.toString()) {
                return createResponse(403, "You are not authorized to update this class");
            }

            const { class_name, class_subtitle, class_order } = Request.body;
            const updateData: any = {};

            // 處理更新的欄位
            if (class_name !== undefined) {
                const sanitizedClassName = sanitizeString(class_name);
                if (sanitizedClassName.trim() === '') {
                    return createResponse(400, "class_name cannot be empty or strings containing security-sensitive characters");
                }
                
                // 檢查更新的名稱是否與課程中其他類別衝突
                if (class_name !== classDoc.class_name) {
                    const existingClass = await ClassModel.findOne({
                        course_id: classDoc.course_id,
                        class_name: class_name,
                        _id: { $ne: classId }
                    }).lean();
                    
                    if (existingClass) {
                        return createResponse(400, "Class with this name already exists in the course");
                    }
                }
                
                updateData.class_name = sanitizedClassName;
            }

            if (class_subtitle !== undefined) {
                const sanitizedSubtitle = sanitizeString(class_subtitle);
                if (sanitizedSubtitle.trim() === '') {
                    return createResponse(400, "class_subtitle cannot be empty or strings containing security-sensitive characters");
                }
                updateData.class_subtitle = sanitizedSubtitle;
            }

            if (class_order !== undefined) {
                if (typeof class_order !== "number" || class_order < 0) {
                    return createResponse(400, "class_order must be a non-negative number");
                }
                updateData.class_order = class_order;
            }

            // 如果沒有任何欄位需要更新
            if (Object.keys(updateData).length === 0) {
                return createResponse(400, "No valid fields to update");
            }

            // 更新類別
            await ClassModel.findByIdAndUpdate(classId, updateData);
            
            logger.info(`Class updated successfully: ${classId}`);
            return createResponse(200, "Update class successfully");
        } catch (err) {
            logger.error("Error in UpdateClassById:", err);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async DeleteClassById(Request: Request): Promise<resp<string | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<string>(Request);
            if (error) {
                return error;
            }

            const { classId } = Request.params;
            if (!classId || !mongoose.Types.ObjectId.isValid(classId)) {
                return createResponse(400, "Invalid class_id format");
            }

            const classDoc = await ClassModel.findById(classId);
            if (!classDoc) {
                return createResponse(404, "Class not found");
            }

            const course = await CourseModel.findById(classDoc.course_id);
            if (!course) {
                return createResponse(404, "Associated course not found");
            }

            // Verify the user is the course owner
            if (user._id.toString() !== course.submitter_user_id.toString()) {
                return createResponse(403, "You are not authorized to delete this class");
            }

            // Remove the class ID from the course's class_ids array
            await CourseModel.findByIdAndUpdate(classDoc.course_id, {
                $pull: { class_ids: classId }
            });

            // Remove all chapters associated with this class
            const chapterIds = classDoc.chapter_ids;
            if (chapterIds && chapterIds.length > 0) {
                await ChapterModel.deleteMany({ _id: { $in: chapterIds } });
                logger.info(`Chapters associated with class ${classId} would be deleted here.`);
            }

            await ClassModel.findByIdAndDelete(classId);

            logger.info(`Class deleted successfully: ${classId}`);
            return createResponse(200, "Delete class successfully");
        } catch (err) {
            logger.error("Error in DeleteClassById:", err);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async AddClassToCourse(Request: Request): Promise<resp<String | { class_id: string } | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<String>(Request);
            if (error) {
                return error;
            }

            const { courseId } = Request.params;
            if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
                return createResponse(400, "Invalid course_id format");
            }

            const course = await CourseModel.findById(courseId);
            if (!course) {
                return createResponse(404, "Course not found");
            }

            const { class_name, class_subtitle, class_order } = Request.body;
            const requiredFields = { class_name, class_subtitle, class_order };
            const missingFields = Object.entries(requiredFields)
                .filter(([_, value]) => value === undefined)
                .map(([key]) => key);
            if (missingFields.length > 0) {
                return createResponse(400, `Missing required fields: ${missingFields.join(', ')}`);
            }

            // 檢查class名稱是否已存在於同一課程中
            const existingClass = await ClassModel.findOne({
                course_id: courseId,
                class_name: class_name
            }).lean();
            if (existingClass) {
                return createResponse(400, "Class with this name already exists in the course");
            }

            // 確認是課程擁有者的操作
            if (user._id.toString() !== course.submitter_user_id.toString()) {
                return createResponse(403, "You are not authorized to add classes to this course");
            }

            if (typeof class_order !== "number" || class_order < 0) {
                return createResponse(400, "class_order must be a non-negative number");
            }

            const sanitizedClassName = sanitizeString(class_name);
            if (sanitizedClassName.trim() === '') {
                return createResponse(400, "class_name cannot be empty or strings containing security-sensitive characters");
            }

            const sanitizedSubtitle = sanitizeString(class_subtitle);
            if (sanitizedSubtitle.trim() === '') {
                return createResponse(400, "class_subtitle cannot be empty or strings containing security-sensitive characters");
            }

            const newClass = new ClassModel({
                course_id: courseId,
                class_name: sanitizedClassName,
                class_subtitle: sanitizedSubtitle,
                class_order,
                chapter_ids: []
            });
            const savedClass = await newClass.save();

            await CourseModel.findByIdAndUpdate(courseId, {
                $push: { class_ids: savedClass._id }
            });

            return createResponse(200, "Class added successfully", { class_id: String(savedClass._id) });
        } catch (err) {
            logger.error("Error in AddClassToCourse:", err);
            return createResponse(500, "Internal Server Error");
        }
    }
}