import { Request } from "express";
import { Document } from "mongoose";
import { Service } from "../abstract/Service";
import { ComputeResourcePlan } from "../interfaces/ComputeResourcePlan";
import { CourseInfo } from "../interfaces/Course/Course";
import { DBResp } from "../interfaces/Response/DBResp";
import { UserProfile } from "../interfaces/User";
import { logger } from "../middlewares/log";
import { userProfileService } from "../modules/users/UserProfileService";
import { userReadService } from "../modules/users/UserReadService";
import { validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { createResponse, resp } from "../utils/resp";

type TokenValidator = <T>(request: Request) => Promise<{ user: any; error?: resp<T | undefined> }>;

export class UserService extends Service {
    public getProfile(Request: Request): Promise<resp<UserProfile | undefined>> {
        return this.withUser(Request, "getting user profile", (user) => {
            return Promise.resolve(userProfileService.getProfile(user));
        });
    }

    public updateProfile(Request: Request): Promise<resp<UserProfile | undefined>> {
        return this.withUser(Request, "updating profile", async (user) => {
            const response = await userProfileService.updateProfile({
                user,
                body: Request.body
            });
            if (response.code === 200) {
                logger.info(`User ${user.username} updated profile successfully`);
            }
            return response;
        });
    }

    public changePassword(Request: Request): Promise<resp<DBResp<Document> | undefined>> {
        return this.withUser(Request, "changing password", async (user) => {
            const response = await userProfileService.changePassword({
                user,
                body: Request.body
            });
            if (response.code === 200) {
                logger.info(`User ${user.username} changed password successfully`);
            }
            return response as resp<DBResp<Document> | undefined>;
        });
    }

    public uploadAvatar(Request: Request): Promise<resp<UserProfile | undefined>> {
        return this.withUser(Request, "uploading avatar", async (user) => {
            const response = await userProfileService.uploadAvatar({
                user,
                file: (Request as any).file as Express.Multer.File
            });
            if (response.code === 200) {
                logger.info(`User ${user.username} uploaded avatar successfully`);
            }
            return response;
        });
    }

    public deleteAvatar(Request: Request): Promise<resp<UserProfile | undefined>> {
        return this.withUser(Request, "deleting avatar", async (user) => {
            const response = await userProfileService.deleteAvatar({ user });
            if (response.code === 200) {
                logger.info(`User ${user.username} deleted avatar successfully`);
            }
            return response;
        });
    }

    public getUserCourses(Request: Request): Promise<resp<Array<CourseInfo> | undefined>> {
        return this.withUser(Request, "getting user courses", (user) => {
            return userReadService.getUserCourses(user);
        });
    }

    public getUserCRP(Request: Request): Promise<resp<ComputeResourcePlan | undefined>> {
        return this.withUser(Request, "getting user CRP", (user) => {
            return userReadService.getUserCRP(user);
        });
    }

    public getUserById(Request: Request): Promise<resp<UserProfile | undefined>> {
        return this.withAuthenticated(Request, validateTokenAndGetSuperAdminUser, "getting user by ID", (user) => {
            return userReadService.getUserById({
                actor: user,
                targetUserId: Request.params.id
            });
        });
    }

    private withUser<T>(
        Request: Request,
        operationName: string,
        action: (user: any) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        return this.withAuthenticated(Request, validateTokenAndGetUser, operationName, action);
    }

    private async withAuthenticated<T>(
        Request: Request,
        validator: TokenValidator,
        operationName: string,
        action: (user: any) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        try {
            const { user, error } = await validator<T>(Request);
            if (error) return error;
            return action(user);
        } catch (error) {
            logger.error(`Error ${operationName}: ${error}`);
            return createResponse(500, error instanceof Error && operationName === "uploading avatar"
                ? error.message
                : "Internal server error");
        }
    }
}
