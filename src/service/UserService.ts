import { Service } from "../abstract/Service";
import { logger } from "../middlewares/log";
import { Document } from "mongoose"
import { DBResp } from "../interfaces/Response/DBResp";
import { resp } from "../utils/resp";
import { UserProfile } from "../interfaces/User";
import { Request } from "express";
import { validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { CourseInfo } from "../interfaces/Course/Course";
import { createResponse } from "../utils/resp";
import { ComputeResourcePlan } from "../interfaces/ComputeResourcePlan";
import { userProfileService } from "../modules/users/UserProfileService";
import { userReadService } from "../modules/users/UserReadService";


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

            return userProfileService.getProfile(user as any);
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

            const response = await userProfileService.updateProfile({
                user: user as any,
                body: Request.body
            });
            if (response.code === 200) {
                logger.info(`User ${user.username} updated profile successfully`);
            }
            return response;
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

            const response = await userProfileService.changePassword({
                user: user as any,
                body: Request.body
            });
            if (response.code === 200) {
                logger.info(`User ${user.username} changed password successfully`);
            }
            return response as resp<DBResp<Document> | undefined>;
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

            const response = await userProfileService.uploadAvatar({
                user: user as any,
                file: (Request as any).file as Express.Multer.File
            });
            if (response.code === 200) {
                logger.info(`User ${user.username} uploaded avatar successfully`);
            }
            return response;
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

            const response = await userProfileService.deleteAvatar({
                user: user as any
            });
            if (response.code === 200) {
                logger.info(`User ${user.username} deleted avatar successfully`);
            }
            return response;
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
            // 1. 驗證 Token 並取得使用者資料 (此部分不變)
            const { user, error } = await validateTokenAndGetUser<Array<CourseInfo>>(Request);
            if (error) {
                return error;
            }

            return userReadService.getUserCourses(user);
        } catch (error) {
            logger.error(`Error getting user courses: ${error}`);
            return createResponse(500, "Internal server error");
        }
    }

    // get user CRP
    public async getUserCRP(Request: Request): Promise<resp<ComputeResourcePlan | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<ComputeResourcePlan>(Request);
            if (error) {
                return error;
            }

            return userReadService.getUserCRP(user);
        } catch (error) {
            logger.error(`Error getting user CRP: ${error}`);
            return createResponse(500, "Internal server error");
        }
    }

    // superadmin only
    public async getUserById(Request: Request): Promise<resp<UserProfile | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<UserProfile>(Request);
            if (error) {
                return error;
            }

            return userReadService.getUserById({
                actor: user,
                targetUserId: Request.params.id
            });
        } catch (error) {
            logger.error(`Error getting user CRP: ${error}`);
            return createResponse(500, "Internal server error");
        }
    }
}
