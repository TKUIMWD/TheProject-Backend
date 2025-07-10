import bcrypt from "bcrypt";
import { Service } from "../abstract/Service";
import { logger } from "../middlewares/log";
import { Document, Types } from "mongoose"
import { DBResp } from "../interfaces/DBResp";
import { resp } from "../utils/resp";
import { UserProfile } from "../interfaces/User";
import { Request } from "express";
import { getUserFromRequest } from "../utils/auth";
import { generateHashedPassword, passwordStrengthCheck } from "../utils/password";
import { sendVerificationEmail } from "../utils/MailSender/VerificationTokenSender";
import { generateVerificationToken } from "../utils/token";
import { processAvatar, deleteAvatar, DEFAULT_AVATAR } from "../utils/avatarUpload";
import { UsersModel } from "../orm/schemas/UserSchemas";
import { Course, CourseInfo } from "../interfaces/Course";
import { CourseModel } from "../orm/schemas/CourseSchemas";
import { log } from "console";


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
        const resp: resp<UserProfile | undefined> = {
            code: 200,
            message: "",
            body: undefined
        };

        try {
            const user = await getUserFromRequest(Request);
            if (!user) {
                resp.code = 400;
                resp.message = "invalid token";
                return resp;
            }

            if (!user.isVerified) {
                resp.code = 403;
                resp.message = "user is not verified";
                return resp;
            }

            const profile: UserProfile = {
                username: user.username,
                email: user.email,
                avatar_path: user.avatar_path || DEFAULT_AVATAR
            };

            resp.body = profile;

        } catch (error) {
            logger.error(`Error getting user profile: ${error}`);
            resp.code = 500;
            resp.message = "Internal server error";
        }

        return resp;
    }

    /** 
    * @param Request (Request.body: {username})
    * @returns resp<UserProfile | undefined>
    */
    public async updateProfile(Request: Request): Promise<resp<UserProfile | undefined>> {
        const resp: resp<UserProfile | undefined> = {
            code: 200,
            message: "",
            body: undefined
        };

        try {
            const user = await getUserFromRequest(Request);
            if (!user) {
                resp.code = 400;
                resp.message = "invalid token";
                return resp;
            }

            const { username } = Request.body;
            if (!username) {
                resp.code = 400;
                resp.message = "missing required field: username";
                return resp;
            }

            const existingUser = await UsersModel.findOne({ username, _id: { $ne: user._id } });
            if (existingUser) {
                resp.code = 400;
                resp.message = "unable to update profile";
                return resp;
            }

            user.username = username;
            await user.save();

            const profile: UserProfile = {
                username: user.username,
                email: user.email,
                avatar_path: user.avatar_path || DEFAULT_AVATAR
            };
            resp.message = "Profile updated successfully";
            resp.body = profile;
            logger.info(`User ${user.username} updated profile successfully`);

        } catch (error) {
            logger.error(`Error updating profile: ${error}`);
            resp.code = 500;
            resp.message = "Internal server error";
        }
        return resp;
    }

    /**
    * @param Request (Request.body: {oldPassword, newPassword, confirmPassword})
    * @returns resp<DBResp<Document> | undefined>
    */
    public async changePassword(Request: Request): Promise<resp<DBResp<Document> | undefined>> {
        const resp: resp<DBResp<Document> | undefined> = {
            code: 200,
            message: "",
            body: undefined
        };
        try {
            const user = await getUserFromRequest(Request);
            if (!user) {
                resp.code = 400;
                resp.message = "invalid token";
                return resp;
            }

            if (!user.isVerified) {
                resp.code = 403;
                resp.message = "user is not verified";
                return resp;
            }

            const { oldPassword, newPassword, confirmPassword } = Request.body;

            if (!oldPassword || !newPassword || !confirmPassword) {
                resp.code = 400;
                const missingFields = [];
                if (!oldPassword) missingFields.push("oldPassword");
                if (!newPassword) missingFields.push("newPassword");
                if (!confirmPassword) missingFields.push("confirmPassword");
                resp.message = `missing required fields: ${missingFields.join(", ")}`;
                return resp;
            }

            if (newPassword !== confirmPassword) {
                resp.code = 400;
                resp.message = "newPassword and confirmPassword do not match";
                return resp;
            }

            const isMatch = await bcrypt.compare(oldPassword, user.password_hash);
            if (!isMatch) {
                resp.code = 400;
                resp.message = "oldPassword is incorrect";
                return resp;
            }

            const passwordStrengthCheckResult = passwordStrengthCheck(newPassword);
            if (!passwordStrengthCheckResult.isValid) {
                resp.code = 400;
                resp.message = `password does not meet the requirements: ${passwordStrengthCheckResult.missingRequirements.join(", ")}`;
                return resp;
            }
            const hashedPassword = await generateHashedPassword(newPassword);
            user.password_hash = hashedPassword;
            await user.save();
            logger.info(`User ${user.username} changed password successfully`);
            resp.message = "Password changed successfully";
        } catch (error) {
            logger.error(`Error changing password: ${error}`);
            resp.code = 500;
            resp.message = "Internal server error";
        }
        return resp;
    }

    /**
     * Upload avatar for user
     * @param Request - Request with file in req.file
     * @returns resp<UserProfile | undefined>
     */
    public async uploadAvatar(Request: Request): Promise<resp<UserProfile | undefined>> {
        const resp: resp<UserProfile | undefined> = {
            code: 200,
            message: "",
            body: undefined
        };

        try {
            const user = await getUserFromRequest(Request);
            if (!user) {
                resp.code = 400;
                resp.message = "invalid token";
                return resp;
            }

            if (!user.isVerified) {
                resp.code = 403;
                resp.message = "user is not verified";
                return resp;
            }

            // 檢查是否有文件上傳
            const file = (Request as any).file as Express.Multer.File;
            if (!file) {
                resp.code = 400;
                resp.message = "no file uploaded";
                return resp;
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

            resp.message = "Avatar uploaded successfully";
            resp.body = profile;
            logger.info(`User ${user.username} uploaded avatar successfully`);

        } catch (error) {
            logger.error(`Error uploading avatar: ${error}`);
            resp.code = 500;
            resp.message = error instanceof Error ? error.message : "Internal server error";
        }

        return resp;
    }

    /**
     * Delete user avatar
     * @param Request - Request object
     * @returns resp<UserProfile | undefined>
     */
    public async deleteAvatar(Request: Request): Promise<resp<UserProfile | undefined>> {
        const resp: resp<UserProfile | undefined> = {
            code: 200,
            message: "",
            body: undefined
        };

        try {
            const user = await getUserFromRequest(Request);
            if (!user) {
                resp.code = 400;
                resp.message = "invalid token";
                return resp;
            }

            if (!user.isVerified) {
                resp.code = 403;
                resp.message = "user is not verified";
                return resp;
            }

            // 檢查用戶是否有自定義頭像
            if (!user.avatar_path || user.avatar_path === DEFAULT_AVATAR) {
                resp.code = 400;
                resp.message = "no custom avatar to delete";
                return resp;
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

            resp.message = "Avatar deleted successfully";
            resp.body = profile;
            logger.info(`User ${user.username} deleted avatar successfully`);

        } catch (error) {
            logger.error(`Error deleting avatar: ${error}`);
            resp.code = 500;
            resp.message = "Internal server error";
        }

        return resp;
    }

    /**
     * get user's courses
     * @param Request - Request object
     * @returns resp<Array<CourseInfo> | undefined>
     */
    public async getUserCourses(Request: Request): Promise<resp<Array<CourseInfo> | undefined>> {
        const resp: resp<Array<CourseInfo> | undefined> = {
            code: 200,
            message: "",
            body: undefined
        };

        try {
            const user = await getUserFromRequest(Request);
            if (!user) {
                resp.code = 400;
                resp.message = "invalid token";
                return resp;
            }

            if (!user.isVerified) {
                resp.code = 403;
                resp.message = "user is not verified";
                return resp;
            }

            const courseObjectIds = user.course_ids.map(id => new Types.ObjectId(id));
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
                resp.message = "User has no courses";
                resp.body = [];
                return resp;
            }

            resp.message = "User courses retrieved successfully";
            resp.body = courseInfo;
        } catch (error) {
            logger.error(`Error getting user courses: ${error}`);
            resp.code = 500;
            resp.message = "Internal server error";
        }

        return resp;
    }
}