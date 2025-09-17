import { Service } from "../abstract/Service";
import { CoursePageDTO } from "../interfaces/Course/CoursePageDTO";
import { getTokenRole, validateTokenAndGetAdminUser, validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { resp, createResponse } from "../utils/resp";
import { Request } from "express";
import { logger } from "../middlewares/log";
import { CourseModel } from "../orm/schemas/CourseSchemas";
import mongoose from "mongoose";
import { CourseMenu } from "../interfaces/Course/CourseMenu";
import { UsersModel } from "../orm/schemas/UserSchemas";
import { ChapterModel } from "../orm/schemas/ChapterSchemas";
import { Course, CourseInfo } from "../interfaces/Course/Course";
import { ClassModel } from "../orm/schemas/ClassSchemas";
import { get } from "jquery";
import Roles from "../enum/role";
import { JSDOM } from 'jsdom';
import DOMPurify, { sanitize } from 'dompurify';
import { sanitizeString, sanitizeArray } from "../utils/sanitize";
import { SubmitterInfo } from "../interfaces/Course/SubmitterInfo";
import { sendCourseInvitationsEmail } from "../utils/MailSender/CourseInviteSender";

export class CourseService extends Service {
    /**
     * @description Auth Request and return course document.
     * @param Request Express request object.
     * @returns A promise resolving to the course document or an error response.
     */
    private async _getAuthorizedCourse(Request: Request): Promise<
        { success: true; Joined: true; course: Course } |
        { success: false; errorResp: resp<undefined> } |
        { success: true; Joined: false; course: Course }
    > {
        const { user, error } = await validateTokenAndGetUser<undefined>(Request);
        if (error) {
            return { success: false, errorResp: error };
        }

        const { courseId } = Request.params;
        if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
            return { success: false, errorResp: createResponse(400, "Invalid course_id format") };
        }

        const course = await CourseModel.findById(courseId).lean();
        const isAuthorized = user.course_ids.some((id: any) => id.toString() === courseId);
        if (!course) {
            return { success: false, errorResp: createResponse(404, "Course not found") };
        }

        if (!isAuthorized) {
            return { success: true, Joined: false, course };
        }

        return { success: true, Joined: true, course };
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
                _id: course._id.toString(),
                course_name: course.course_name,
                course_subtitle: course.course_subtitle,
                course_description: course.course_description,
                course_duration_in_minutes: course.duration_in_minutes,
                course_difficulty: course.difficulty as "Easy" | "Medium" | "Hard",
                course_rating: course.rating,
                course_reviews: course.reviews,
                course_update_date: course.update_date,
                class_ids: course.class_ids,
                submitterInfo: {
                    username: submitter.username,
                    email: submitter.email,
                    avatar_path: submitter.avatar_path
                },
            };

            if (authResult.Joined === false) {
                return createResponse(403, "You are not joined to this course", courseData);
            }

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

            if (authResult.Joined === false) {
                return createResponse(403, "You are not joined to this course", courseMenuData);
            }

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
    public async AddCourse(Request: Request): Promise<resp<String | { course_id: String } | undefined>> {
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

            // input sanitization
            const sanitizedCourseName = sanitizeString(course_name);
            if (sanitizedCourseName.trim() === '') {
                return createResponse(400, "course_name cannot be empty or strings containing security-sensitive characters");
            }
            const sanitizedCourseSubtitle = sanitizeString(course_subtitle || '');
            if (sanitizedCourseSubtitle.trim() === '') {
                return createResponse(400, "course_subtitle cannot be empty or strings containing security-sensitive characters");
            }
            const sanitizedCourseDescription = sanitizeString(course_description || '');
            if (sanitizedCourseDescription.trim() === '') {
                return createResponse(400, "course_description cannot be empty or strings containing security-sensitive characters");
            }

            if (duration_in_minutes <= 0 || typeof duration_in_minutes !== "number") {
                return createResponse(400, "duration_in_minutes must be a non-negative number");
            }

            if (difficulty !== "Easy" && difficulty !== "Medium" && difficulty !== "Hard") {
                return createResponse(400, "difficulty must be one of 'Easy', 'Medium', or 'Hard'");
            }

            // 如果相同名稱的課程存在，則返回錯誤
            const existingCourse = await CourseModel.findOne({ course_name: sanitizedCourseName });
            if (existingCourse) {
                return createResponse(400, "Course with the same name already exists");
            }

            const newCourse: Course = ({
                _id: new mongoose.Types.ObjectId().toString(),
                course_name: sanitizedCourseName,
                course_subtitle: sanitizedCourseSubtitle,
                course_description: sanitizedCourseDescription,
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
            return createResponse(200, "Course created successfully", { course_id: String(savedCourse._id) });
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

            const { courseId } = Request.params;
            if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
                return createResponse(400, "Invalid course_id format");
            }

            // 檢查是不是課程擁有者的操作
            const course = await CourseModel.findById(courseId);
            if (!course) {
                return createResponse(404, "Course not found");
            }

            if (course.submitter_user_id !== user._id.toString()) {
                return createResponse(403, "You are not authorized to update this course");
            }

            // 輸入檢查
            const requestBody = Request.body;
            const updates: { [key: string]: any } = {};

            if (requestBody.course_name !== undefined) {
                const sanitized = sanitizeString(requestBody.course_name);
                if (sanitized.trim() === '') return createResponse(400, "Course name cannot be empty or strings containing security-sensitive characters");
                updates.course_name = sanitized;
            }
            if (requestBody.course_subtitle !== undefined) {
                const sanitizedSubtitle = sanitizeString(requestBody.course_subtitle);
                if (sanitizedSubtitle.trim() === '') return createResponse(400, "course_subtitle cannot be empty or strings containing security-sensitive characters");
                updates.course_subtitle = sanitizedSubtitle;
            }
            if (requestBody.course_description !== undefined) {
                const sanitizedDescription = sanitizeString(requestBody.course_description);
                if (sanitizedDescription.trim() === '') return createResponse(400, "course_description cannot be empty or strings containing security-sensitive characters");
                updates.course_description = sanitizedDescription;
            }
            if (requestBody.duration_in_minutes !== undefined) {
                if (typeof requestBody.duration_in_minutes !== 'number' || requestBody.duration_in_minutes <= 0) {
                    return createResponse(400, "duration_in_minutes must be a positive number.");
                }
                updates.duration_in_minutes = requestBody.duration_in_minutes;
            }
            if (requestBody.difficulty !== undefined) {
                const validDifficulties = ["Easy", "Medium", "Hard"];
                if (!validDifficulties.includes(requestBody.difficulty)) {
                    return createResponse(400, "difficulty must be one of 'Easy', 'Medium', or 'Hard'.");
                }
                updates.difficulty = requestBody.difficulty;
            }

            if (Object.keys(updates).length === 0) {
                return createResponse(400, "No valid fields provided for update.");
            }

            updates.update_date = new Date();
            updates.status = "編輯中";

            // 更新課程
            const updatedCourse = await CourseModel.findByIdAndUpdate(
                courseId,
                { $set: updates },
                { new: true }
            );

            if (!updatedCourse) {
                // 可能發生在檢查和更新之間的極短時間內課程被刪除
                return createResponse(404, "Course not found during update operation.");
            }

            logger.info(`Course updated successfully: ${courseId}`);
            return createResponse(200, "Course updated successfully", { course_id: String(course._id) });
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

            const { courseId } = Request.params;
            if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
                return createResponse(400, "Invalid course_id format");
            }

            const courseToDelete = await CourseModel.findById(courseId).lean();
            if (!courseToDelete) {
                return createResponse(404, "Course not found");
            }

            // 如果課程下有class，則進行連動刪除
            if (courseToDelete.class_ids && courseToDelete.class_ids.length > 0) {
                // 找出所有class下的所有chapter ID
                const classes = await ClassModel.find({ _id: { $in: courseToDelete.class_ids } }).select('chapter_ids').lean();
                const chapterIdsToDelete = classes.flatMap(cls => cls.chapter_ids);

                // 2. 刪除所有chapter
                if (chapterIdsToDelete.length > 0) {
                    await ChapterModel.deleteMany({ _id: { $in: chapterIdsToDelete } });
                    logger.info(`Deleted ${chapterIdsToDelete.length} chapters for course ${courseId}`);
                }

                // 3. 刪除所有class
                await ClassModel.deleteMany({ _id: { $in: courseToDelete.class_ids } });
                logger.info(`Deleted ${courseToDelete.class_ids.length} classes for course ${courseId}`);
            }

            // 從所有已加入此課程的使用者中移除課程ID
            await UsersModel.updateMany(
                { course_ids: courseId },
                { $pull: { course_ids: courseId } }
            );
            logger.info(`Removed course ${courseId} from all users' course lists`);

            // 刪除課程本身
            await CourseModel.findByIdAndDelete(courseId);

            logger.info(`Course deleted successfully: ${courseId}`);
            return createResponse(200, "Course and all its related classes and chapters deleted successfully");

        } catch (err) {
            logger.error("Error in DeleteCourseById:", err);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async GetAllPublicCourses(Request: Request): Promise<resp<String | CourseInfo[] | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<String>(Request);
            if (error) {
                return error;
            }

            const courseDocs = await CourseModel.find({ status: "公開" }).lean();
            const coursesPromises = courseDocs.map(async (course): Promise<CourseInfo | null> => {
                const submitter = await UsersModel.findById(course.submitter_user_id).lean();
                if (!submitter) {
                    logger.warn(`Submitter not found for course ${course._id}`);
                    return null;
                }

                return {
                    _id: course._id.toString(),
                    course_name: course.course_name,
                    course_subtitle: course.course_subtitle,
                    duration_in_minutes: course.duration_in_minutes,
                    difficulty: course.difficulty as "Easy" | "Medium" | "Hard",
                    rating: course.rating,
                    teacher_name: submitter.username,
                    update_date: course.update_date,
                    status: course.status as "公開" | "未公開" | "編輯中" | "審核中" | "審核未通過"
                };
            });

            const courses = (await Promise.all(coursesPromises)).filter((c): c is CourseInfo => c !== null);

            if (!courses) {
                return createResponse(404, "No public courses found");
            }

            return createResponse(200, "success", courses);
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

            const { courseId } = Request.params;
            if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
                return createResponse(400, "Invalid course_id format");
            }

            // 檢查課程是否存在
            const course = await CourseModel.findById(courseId);
            if (!course) {
                return createResponse(404, "Course not found");
            }

            if (course.status !== "公開") {
                return createResponse(403, "You can only join courses that are publicly available");
            }

            // 檢查用戶是否已經加入該課程
            if (user.course_ids.includes(courseId)) {
                return createResponse(400, "You have already joined this course");
            }

            // 將課程 ID 添加到用戶的 course_ids 中
            user.course_ids.push(courseId);
            await UsersModel.findByIdAndUpdate(user._id, { course_ids: user.course_ids });

            logger.info(`User ${user._id} joined course ${courseId}`);
            return createResponse(200, "Successfully joined the course");
        } catch (err) {
            logger.error("Error in JoinCourseById:", err);
            return createResponse(500, "Internal Server Error");
        }

    }

    public async ApprovedCourseById(Request: Request): Promise<resp<String | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<String>(Request);
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

            // 檢查課程狀態是否為審核中
            if (course.status !== "審核中") {
                return createResponse(400, "Course is not in '審核中' status");
            }

            course.status = "未公開"; // 更新狀態為未公開
            const updatedCourse = await course.save();
            if (!updatedCourse) {
                return createResponse(500, "Failed to update course status");
            }

            logger.info(`Course ${courseId} approved successfully by user ${user._id}`);
            return createResponse(200, "Course approved successfully");

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

            const { courseId } = Request.params;
            if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
                return createResponse(400, "Invalid course_id format");
            }

            const course = await CourseModel.findById(courseId);
            if (!course) {
                return createResponse(404, "Course not found");
            }

            // 檢查課程狀態是否為審核中
            if (course.status !== "審核中") {
                return createResponse(400, "Course is not in '審核中' status");
            }

            course.status = "審核未通過"; // 更新狀態為審核未通過
            const updatedCourse = await course.save();
            if (!updatedCourse) {
                return createResponse(500, "Failed to update course status");
            }

            logger.info(`Course ${courseId} unapproved successfully by user ${user._id}`);
            return createResponse(200, "Course unapproved successfully");

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
            const { course_id, emails } = Request.body;
            console.log(Request.body);
            if (!course_id || !Array.isArray(emails) || emails.length === 0) {
                return createResponse(400, "Missing course_id or emails array");
            }
            const course = await CourseModel.findById(course_id).lean();
            if (!course) {
                return createResponse(404, "Course not found");
            }
            // 取得課程成員
            const inviter = user.username;
            const invited: string[] = [];
            for (const email of emails) {
                const invitedUser = await UsersModel.findOne({ email }).lean();
                if (!invitedUser) {
                    continue;
                }
                // 檢查用戶是否已經加入該課程
                if (invitedUser.course_ids.includes(course_id)) {
                    continue;
                }
                // 可選：發送郵件邀請
                await sendCourseInvitationsEmail(email, course.course_name, course_id, inviter);
                invited.push(email);
            }
            return createResponse(200, "Invitations sent");
        } catch (err) {
            logger.error("Error in InviteToJoinCourse:", err);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async getFirstTemplateByCourseID(Request: Request): Promise<resp<String | { template_id: string } | undefined>> {
        try {
            const authResult = await this._getAuthorizedCourse(Request);
            if (!authResult.success) {
                return authResult.errorResp;
            }

            const { courseId } = Request.params;
            if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
                return createResponse(400, "Invalid course_id format");
            }

            const course = await CourseModel.findById(courseId).lean();
            if (!course) {
                return createResponse(404, "Course not found");
            }
            // 如果使用者未加入課程，維持權限一致性（和 getCourseMenu 類似可返回 403）
            const { user, error } = await validateTokenAndGetUser<string>(Request);
            if (error) {
                return error;
            }
            // 檢查 user 是否已加入課程
            // Debug: print user course_ids and whether it contains current courseId
            const normalizedCourseIds = (user.course_ids || []).map((id: any) => id?.toString());
            const isAuthorized = normalizedCourseIds.includes(courseId);
            console.log('user.course_ids(normalized)=', normalizedCourseIds, 'includes courseId?', isAuthorized, 'courseId=', courseId);
            if (!isAuthorized) {
                return createResponse(403, "You are not authorized to access this course");
            }

            if (!course.class_ids || course.class_ids.length === 0) {
                return createResponse(404, "No classes found in this course");
            }

            const classes = await ClassModel.find({ _id: { $in: course.class_ids } }).lean();
            if (!classes || classes.length === 0) {
                return createResponse(404, "Classes not found");
            }
            const sortedClasses = classes.sort((a: any, b: any) => a.class_order - b.class_order);

            // 收集所有章節 id 一次查詢
            const allChapterIds = sortedClasses.flatMap(c => c.chapter_ids || []);
            if (allChapterIds.length === 0) {
                return createResponse(404, "No chapters found in this course");
            }
            const chapters = await ChapterModel.find({ _id: { $in: allChapterIds } }).lean();
            if (!chapters || chapters.length === 0) {
                return createResponse(404, "Chapters not found");
            }
            const chapterMap = new Map(chapters.map(ch => [ch._id.toString(), ch]));

            // 按班級順序、章節順序找第一個具有 template_id 的章節
            for (const cls of sortedClasses) {
                const chapterDocs = (cls.chapter_ids || [])
                    .map((id: string) => chapterMap.get(id.toString()))
                    .filter((c: any) => !!c);
                // 章節依 chapter_order 排序
                chapterDocs.sort((a: any, b: any) => a.chapter_order - b.chapter_order);
                for (const ch of chapterDocs) {
                    if (ch && typeof ch.template_id === 'string' && ch.template_id.trim() !== '') {
                        return createResponse(200, "success", { template_id: ch.template_id });
                    }
                }
            }

            return createResponse(404, "No template_id found in any chapter of this course");
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

            const courseDocs = await CourseModel.find().lean();
            const coursesPromises = courseDocs.map(async (course): Promise<CourseInfo | null> => {
                const submitter = await UsersModel.findById(course.submitter_user_id).lean();
                if (!submitter) {
                    logger.warn(`Submitter not found for course ${course._id}`);
                    return null;
                }

                return {
                    _id: course._id.toString(),
                    course_name: course.course_name,
                    course_subtitle: course.course_subtitle,
                    duration_in_minutes: course.duration_in_minutes,
                    difficulty: course.difficulty as "Easy" | "Medium" | "Hard",
                    rating: course.rating,
                    teacher_name: submitter.username,
                    update_date: course.update_date,
                    status: course.status as "公開" | "未公開" | "編輯中" | "審核中" | "審核未通過"
                };
            });

            const courses = (await Promise.all(coursesPromises)).filter((c): c is CourseInfo => c !== null);

            if (!courses || courses.length === 0) {
                return createResponse(404, "No courses found");
            }

            return createResponse(200, "success", courses);
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

            const courseDocs = await CourseModel.find({ status: "審核中" }).lean();
            const coursesPromises = courseDocs.map(async (course): Promise<CourseInfo | null> => {
                const submitter = await UsersModel.findById(course.submitter_user_id).lean();
                if (!submitter) {
                    logger.warn(`Submitter not found for course ${course._id}`);
                    return null;
                }

                return {
                    _id: course._id.toString(),
                    course_name: course.course_name,
                    course_subtitle: course.course_subtitle,
                    duration_in_minutes: course.duration_in_minutes,
                    difficulty: course.difficulty as "Easy" | "Medium" | "Hard",
                    rating: course.rating,
                    teacher_name: submitter.username,
                    update_date: course.update_date,
                    status: course.status as "公開" | "未公開" | "編輯中" | "審核中" | "審核未通過"
                };
            });

            const courses = (await Promise.all(coursesPromises)).filter((c): c is CourseInfo => c !== null);

            if (!courses) {
                return createResponse(404, "No pending courses found");
            }

            if (courses.length === 0) {
                return createResponse(200, "No pending courses found", []);
            }

            return createResponse(200, "success", courses);
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
            if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
                return createResponse(400, "Invalid course_id format");
            }

            // 檢查是不是課程擁有者的操作
            const course = await CourseModel.findById(courseId);
            if (!course) {
                return createResponse(404, "Course not found");
            }

            if (course.submitter_user_id !== user._id.toString()) {
                return createResponse(403, "You are not authorized to submit this course");
            }

            // 檢查課程是否至少有一個 class 和一個 chapter
            if (!course.class_ids || course.class_ids.length === 0) {
                return createResponse(400, "Course must have at least one class before submission");
            }

            const classes = await ClassModel.find({ _id: { $in: course.class_ids } }).lean();
            if (!classes || classes.length === 0) {
                return createResponse(400, "Course must have at least one class before submission");
            }

            let totalChapters = 0;
            for (const cls of classes) {
                if (cls.chapter_ids && cls.chapter_ids.length > 0) {
                    totalChapters += cls.chapter_ids.length;
                }
            }

            if (totalChapters === 0) {
                return createResponse(400, "Course must have at least one chapter before submission");
            }

            // 更新課程狀態為審核中
            course.status = "審核中";
            const updatedCourse = await course.save();
            if (!updatedCourse) {
                return createResponse(500, "Failed to update course status");
            }

            logger.info(`Course ${courseId} submitted for review successfully by user ${user._id}`);
            return createResponse(200, "Course submitted for review successfully");

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
            if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
                return createResponse(400, "Invalid course_id format");
            }

            if (status !== "公開" && status !== "未公開") {
                return createResponse(400, "Status must be either '公開' or '未公開'");
            }

            // 檢查是不是課程擁有者的操作
            const course = await CourseModel.findById(courseId);
            if (!course) {
                return createResponse(404, "Course not found");
            }

            if (course.submitter_user_id !== user._id.toString()) {
                return createResponse(403, "You are not authorized to change the status of this course");
            }

            // 如果要設為公開，檢查課程是否已通過審核
            if (status === "公開" && course.status !== "未公開") {
                return createResponse(400, "Only courses with status '未公開' can be set to '公開'");
            }

            course.status = status;
            const updatedCourse = await course.save();
            if (!updatedCourse) {
                return createResponse(500, "Failed to update course status");
            }

            logger.info(`Course ${courseId} status changed to ${status} by user ${user._id}`);
            return createResponse(200, `Course status updated to ${status} successfully`);

        } catch (err) {
            logger.error("Error in setCourseStatus:", err);
            return createResponse(500, "Internal Server Error");
        }
    }
}