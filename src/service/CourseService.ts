import { Service } from "../abstract/Service";
import { CoursePageDTO } from "../interfaces/Course/CoursePageDTO";
import { getTokenRole, validateTokenAndGetAdminUser, validateTokenAndGetUser } from "../utils/auth";
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
import { get } from "jquery";
import Roles from "../enum/role";

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

    /**
     * @description Add a new course.
     * @param Request Express request object.
     * @returns A promise resolving to the created course or an error response.
     */
    public async AddCourse(Request: Request): Promise<resp<String | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<String>(Request)
            if (error) {
                return error;
            }

            const { course_name, course_subtitle, course_description, duration_in_minutes, difficulty } = Request.body;
            const requiredFields = {
                course_name,
                course_subtitle,
                course_description,
                duration_in_minutes,
                difficulty
            };

            const missingFields = Object.entries(requiredFields)
                .filter(([_, value]) => value === undefined)
                .map(([key]) => key);

            if (missingFields.length > 0) {
                return createResponse(400, `Missing required fields: ${missingFields.join(', ')}`);
            }

            if (user.error) {
                return user.error;
            }

            const newCourse: Course = ({
                course_name,
                course_subtitle,
                course_description,
                duration_in_minutes,
                difficulty,
                reviews: [],
                rating: 0,
                class_ids: [],
                update_date: new Date(),
                submitter_user_id: user._id,
                status: "編輯中", // 初始狀態為編輯中
            });

            const savedCourse = await new CourseModel(newCourse).save();
            // Add the course ID to user's course_ids array
            try {
                user.course_ids.push(String(savedCourse._id));
                const updateResult = await UsersModel.findByIdAndUpdate(
                    user._id,
                    { course_ids: user.course_ids }
                );

                if (!updateResult) {
                    logger.error(`Failed to update user ${user._id} with new course ID`);
                    // rolling back course creation
                    await CourseModel.findByIdAndDelete(savedCourse._id);
                    return createResponse(500, "Failed to associate course with user");
                }
            } catch (updateErr) {
                logger.error(`Error updating user with course: ${updateErr}`);
                // Roll back course creation
                await CourseModel.findByIdAndDelete(savedCourse._id);
                return createResponse(500, "Failed to update user with new course");
            }

            if (!savedCourse) {
                return createResponse(500, "Failed to create course");
            }
            logger.info(`Course created successfully: ${savedCourse._id}`);
            return createResponse(200, "Course created successfully", String(savedCourse._id));
        } catch (err) {
            logger.error("Error in AddCourse:", err);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async UpdateCourseById(Request: Request): Promise<resp<String | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<String>(Request);
            if (error) {
                return error;
            }

            const { courseId } = Request.params;
            if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
                return createResponse(400, "Invalid course_id format");
            }

            const requestBody = Request.body;
            const allowedUpdates = ["course_name", "course_subtitle", "course_description", "duration_in_minutes", "difficulty"];
            const sanitizedUpdates: { [key: string]: any } = {};
            Object.keys(requestBody).forEach(key => {
                if (allowedUpdates.includes(key)) {
                    sanitizedUpdates[key] = requestBody[key];
                }
            });

            if (Object.keys(sanitizedUpdates).length === 0) {
                return createResponse(400, "No valid fields to update");
            }

            sanitizedUpdates.update_date = new Date();

            const updatedCourse = await CourseModel.findByIdAndUpdate(
                courseId,
                { $set: sanitizedUpdates },
                { new: true }
            );

            if (!updatedCourse) {
                return createResponse(404, "Course not found");
            }

            logger.info(`Course updated successfully: ${courseId}`);
            return createResponse(200, "Course updated successfully", String(updatedCourse._id));

        }
        catch (err) {
            logger.error("Error in UpdateCourseById:", err);
            return createResponse(500, "Internal Server Error");
        }
    }

    // todo delete class, chapter
    public async DeleteCourseById(Request: Request): Promise<resp<String | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<String>(Request)
            if (error) {
                return error;
            }

            const { courseId } = Request.params;
            if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
                return createResponse(400, "Invalid course_id format");
            }

            const deletedCourse = await CourseModel.findByIdAndDelete(courseId);
            if (!deletedCourse) {
                return createResponse(404, "Course not found");
            }

            // Remove the course ID from user's course_ids array
            user.course_ids = user.course_ids.filter((id: any) => id.toString() !== courseId);
            await UsersModel.findByIdAndUpdate(user._id, { course_ids: user.course_ids });

            logger.info(`Course deleted successfully: ${courseId}`);
            return createResponse(200, "Course deleted successfully");

        } catch (err) {
            logger.error("Error in DeleteCourseById:", err);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async AddClassToCourse(Request: Request): Promise<resp<String | undefined>> {
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

            const newClass = new ClassModel({
                course_id: courseId,
                class_name,
                class_subtitle,
                class_order,
                chapter_ids: []
            });
            await newClass.save();
            
            // 更新課程的class列表
            course.class_ids.push(newClass._id);
            await CourseModel.findByIdAndUpdate(courseId, { class_ids: course.class_ids });

            return createResponse(200, "Class added successfully");
        } catch (err) {
            logger.error("Error in AddClassToCourse:", err);
            return createResponse(500, "Internal Server Error");
        }
    }
}