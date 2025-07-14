import bcrypt from "bcrypt";
import { Service } from "../abstract/Service";
import { logger } from "../middlewares/log";
import { Document, Types } from "mongoose"
import { DBResp } from "../interfaces/DBResp";
import { resp } from "../utils/resp";
import { UserProfile } from "../interfaces/User";
import { Request } from "express";
import { validateTokenAndGetUser } from "../utils/auth";
import { generateHashedPassword, passwordStrengthCheck } from "../utils/password";
import { processAvatar, deleteAvatar, DEFAULT_AVATAR } from "../utils/avatarUpload";
import { UsersModel } from "../orm/schemas/UserSchemas";
import { Course, CourseInfo } from "../interfaces/Course/Course";
import { CourseModel } from "../orm/schemas/CourseSchemas";
import { log } from "console";
import { createResponse } from "../utils/resp";


export class UserService extends Service {
    /**
     * Checks if enough time has passed since the last email was sent.
     * @param lastTimeSent - The Date when the last email was sent (can be null/undefined if never sent).
     * @param intervalMinutes - The minimum interval in minutes required between emails.
     * @returns true if an email can be sent, false otherwise.
     */
    public canSendEmail(lastTimeSent: Date | null | undefined, intervalMinutes: number): boolean {
        if (!lastTimeSent) return true;
        const now = new Date();
        const diffMs = now.getTime() - lastTimeSent.getTime();
        const diffMinutes = diffMs / (1000 * 60);
        return diffMinutes >= intervalMinutes;
    }

    /*
    * @param Request
    * @returns resp<DBResp<Document> | undefined>
    */
    public async getProfile(Request: Request): Promise<resp<UserProfile | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<UserProfile>(Request);
            if (error) {
                return error;
            }

            if (!user.isVerified) {
                return createResponse(403, "user is not verified");
            }

            const profile: UserProfile = {
                username: user.username,
                email: user.email,
                avatar_path: user.avatar_path || DEFAULT_AVATAR
            };

            return createResponse(200, "Profile retrieved successfully", profile);
        } catch (error) {
            logger.error(`Error getting user profile: ${error}`);
            return createResponse(500, "Internal server error");
        }
    }

    /** 
    * @param Request (Request.body: {username})
    * @returns resp<UserProfile | undefined>
    */
    public async updateProfile(Request: Request): Promise<resp<UserProfile | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<UserProfile>(Request);
            if (error) {
                return error;
            }

            const { username } = Request.body;
            if (!username) {
                return createResponse(400, "missing required field: username");
            }

            const existingUser = await UsersModel.findOne({ username, _id: { $ne: user._id } });
            if (existingUser) {
                return createResponse(400, "unable to update profile");
            }

            user.username = username;
            await user.save();

            const profile: UserProfile = {
                username: user.username,
                email: user.email,
                avatar_path: user.avatar_path || DEFAULT_AVATAR
            };
            
            logger.info(`User ${user.username} updated profile successfully`);
            return createResponse(200, "Profile updated successfully", profile);
        } catch (error) {
            logger.error(`Error updating profile: ${error}`);
            return createResponse(500, "Internal server error");
        }
    }

    /**
    * @param Request (Request.body: {oldPassword, newPassword, confirmPassword})
    * @returns resp<DBResp<Document> | undefined>
    */
    public async changePassword(Request: Request): Promise<resp<DBResp<Document> | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<DBResp<Document>>(Request);
            if (error) {
                return error;
            }

            if (!user.isVerified) {
                return createResponse(403, "user is not verified");
            }

            const { oldPassword, newPassword, confirmPassword } = Request.body;

            if (!oldPassword || !newPassword || !confirmPassword) {
                const missingFields = [];
                if (!oldPassword) missingFields.push("oldPassword");
                if (!newPassword) missingFields.push("newPassword");
                if (!confirmPassword) missingFields.push("confirmPassword");
                return createResponse(400, `missing required fields: ${missingFields.join(", ")}`);
            }

            if (newPassword !== confirmPassword) {
                return createResponse(400, "newPassword and confirmPassword do not match");
            }

            const isMatch = await bcrypt.compare(oldPassword, user.password_hash);
            if (!isMatch) {
                return createResponse(400, "oldPassword is incorrect");
            }

            const passwordStrengthCheckResult = passwordStrengthCheck(newPassword);
            if (!passwordStrengthCheckResult.isValid) {
                return createResponse(400, `password does not meet the requirements: ${passwordStrengthCheckResult.missingRequirements.join(", ")}`);
            }
            
            const hashedPassword = await generateHashedPassword(newPassword);
            user.password_hash = hashedPassword;
            await user.save();
            logger.info(`User ${user.username} changed password successfully`);
            return createResponse(200, "Password changed successfully");
        } catch (error) {
            logger.error(`Error changing password: ${error}`);
            return createResponse(500, "Internal server error");
        }
    }

    /**
     * Upload avatar for user
     * @param Request - Request with file in req.file
     * @returns resp<UserProfile | undefined>
     */
    public async uploadAvatar(Request: Request): Promise<resp<UserProfile | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<UserProfile>(Request);
            if (error) {
                return error;
            }

            if (!user.isVerified) {
                return createResponse(403, "user is not verified");
            }

            // 檢查是否有文件上傳
            const file = (Request as any).file as Express.Multer.File;
            if (!file) {
                return createResponse(400, "no file uploaded");
            }

            // 如果用戶已有頭像，先刪除舊的
            if (user.avatar_path && user.avatar_path !== DEFAULT_AVATAR) {
                deleteAvatar(user.avatar_path);
            }

            // 處理新頭像
            const avatarPath = await processAvatar(file);
            user.avatar_path = avatarPath;
            await user.save();

            const profile: UserProfile = {
                username: user.username,
                email: user.email,
                avatar_path: user.avatar_path
            };

            logger.info(`User ${user.username} uploaded avatar successfully`);
            return createResponse(200, "Avatar uploaded successfully", profile);
        } catch (error) {
            logger.error(`Error uploading avatar: ${error}`);
            return createResponse(500, error instanceof Error ? error.message : "Internal server error");
        }
    }

    /**
     * Delete user avatar
     * @param Request - Request object
     * @returns resp<UserProfile | undefined>
     */
    public async deleteAvatar(Request: Request): Promise<resp<UserProfile | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<UserProfile>(Request);
            if (error) {
                return error;
            }

            if (!user.isVerified) {
                return createResponse(403, "user is not verified");
            }

            // 檢查用戶是否有自定義頭像
            if (!user.avatar_path || user.avatar_path === DEFAULT_AVATAR) {
                return createResponse(400, "no custom avatar to delete");
            }

            // 刪除頭像文件
            deleteAvatar(user.avatar_path);

            // 重置為默認頭像
            user.avatar_path = DEFAULT_AVATAR;
            await user.save();

            const profile: UserProfile = {
                username: user.username,
                email: user.email,
                avatar_path: user.avatar_path
            };

            logger.info(`User ${user.username} deleted avatar successfully`);
            return createResponse(200, "Avatar deleted successfully", profile);
        } catch (error) {
            logger.error(`Error deleting avatar: ${error}`);
            return createResponse(500, "Internal server error");
        }
    }

    /**
     * get user's courses
     * @param Request - Request object
     * @returns resp<Array<CourseInfo> | undefined>
     */
    public async getUserCourses(Request: Request): Promise<resp<Array<CourseInfo> | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<Array<CourseInfo>>(Request);
            if (error) {
                return error;
            }

            if (!user.isVerified) {
                return createResponse(403, "user is not verified");
            }

            const courseObjectIds = user.course_ids.map((id: string) => new Types.ObjectId(id));
            const courseInfo = await CourseModel.aggregate([
                {
                    $match: {
                        "_id": { $in: courseObjectIds }
                    }
                },
                {
                    $addFields: {
                        convertedSubmitterId: { $toObjectId: "$submitter_user_id" }
                    }
                },
                {
                    $lookup: {
                        from: "users",
                        localField: "convertedSubmitterId",
                        foreignField: "_id",
                        as: "teacherDetails"
                    }
                },
                {
                    $unwind: {
                        path: "$teacherDetails",
                        preserveNullAndEmptyArrays: true
                    }
                },
                {
                    $project: {
                        _id: "$_id",
                        course_name: "$course_name",
                        duration_in_minutes: "$duration_in_minutes",
                        difficulty: "$difficulty",
                        rating: "$rating",
                        teacher_name: { $ifNull: ["$teacherDetails.username", "Unknown"] },
                        update_date: "$update_date"
                    }
                }
            ]);

            if (!courseInfo || courseInfo.length === 0) {
                return createResponse(200, "User has no courses", []);
            }

            return createResponse(200, "User courses retrieved successfully", courseInfo);
        } catch (error) {
            logger.error(`Error getting user courses: ${error}`);
            return createResponse(500, "Internal server error");
        }
    }
}