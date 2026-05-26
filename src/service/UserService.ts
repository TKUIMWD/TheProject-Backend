import { Request } from "express";
import { Document } from "mongoose";
import { Service } from "../abstract/Service";
import { ComputeResourcePlan } from "../interfaces/ComputeResourcePlan";
import { CourseInfo } from "../interfaces/Course/Course";
import { DBResp } from "../interfaces/Response/DBResp";
import { User, UserProfile } from "../interfaces/User";
import { logger } from "../middlewares/log";
import { userProfileService } from "../modules/users/UserProfileService";
import { userReadService } from "../modules/users/UserReadService";
import { validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { createResponse, resp } from "../utils/resp";

type AuthenticatedUser = User & {
    save(): Promise<unknown>;
};

type TokenValidator = <T>(request: Request) => Promise<{ user: AuthenticatedUser; error?: resp<T | undefined> }>;

type UserServiceInput = {
    user: AuthenticatedUser;
    body: Request["body"];
    params: Request["params"];
    file?: Express.Multer.File;
};

export class UserService extends Service {
    public getProfile(Request: Request): Promise<resp<UserProfile | undefined>> {
        return this.withUserInput(Request, "getting user profile", (input) => {
            return Promise.resolve(userProfileService.getProfile(input.user));
        });
    }

    public updateProfile(Request: Request): Promise<resp<UserProfile | undefined>> {
        return this.withUserInput(Request, "updating profile", async (input) => {
            const response = await userProfileService.updateProfile(input);
            this.logSuccess(response, input.user.username, "updated profile successfully");
            return response;
        });
    }

    public changePassword(Request: Request): Promise<resp<DBResp<Document> | undefined>> {
        return this.withUserInput(Request, "changing password", async (input) => {
            const response = await userProfileService.changePassword(input);
            this.logSuccess(response, input.user.username, "changed password successfully");
            return response as resp<DBResp<Document> | undefined>;
        });
    }

    public uploadAvatar(Request: Request): Promise<resp<UserProfile | undefined>> {
        return this.withUserInput(Request, "uploading avatar", async (input) => {
            const response = await userProfileService.uploadAvatar(input);
            this.logSuccess(response, input.user.username, "uploaded avatar successfully");
            return response;
        });
    }

    public deleteAvatar(Request: Request): Promise<resp<UserProfile | undefined>> {
        return this.withUserInput(Request, "deleting avatar", async (input) => {
            const response = await userProfileService.deleteAvatar(input);
            this.logSuccess(response, input.user.username, "deleted avatar successfully");
            return response;
        });
    }

    public getUserCourses(Request: Request): Promise<resp<Array<CourseInfo> | undefined>> {
        return this.withUserInput(Request, "getting user courses", (input) => {
            return userReadService.getUserCourses(input.user);
        });
    }

    public getUserCRP(Request: Request): Promise<resp<ComputeResourcePlan | undefined>> {
        return this.withUserInput(Request, "getting user CRP", (input) => {
            return userReadService.getUserCRP(input.user);
        });
    }

    public getUserById(Request: Request): Promise<resp<UserProfile | undefined>> {
        return this.withAuthenticatedInput(Request, validateTokenAndGetSuperAdminUser, "getting user by ID", (input) => {
            return userReadService.getUserById({
                actor: input.user,
                targetUserId: input.params.id
            });
        });
    }

    private withUserInput<T>(
        Request: Request,
        operationName: string,
        action: (input: UserServiceInput) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        return this.withAuthenticatedInput(Request, validateTokenAndGetUser, operationName, action);
    }

    private async withAuthenticatedInput<T>(
        Request: Request,
        validator: TokenValidator,
        operationName: string,
        action: (input: UserServiceInput) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        try {
            const { user, error } = await validator<T>(Request);
            if (error) return error;
            return action(this.toServiceInput(Request, user));
        } catch (error) {
            logger.error(`Error ${operationName}: ${error}`);
            return createResponse(500, error instanceof Error && operationName === "uploading avatar"
                ? error.message
                : "Internal server error");
        }
    }

    private toServiceInput(Request: Request, user: AuthenticatedUser): UserServiceInput {
        return {
            user,
            body: Request.body,
            params: Request.params,
            file: (Request as Request & { file?: Express.Multer.File }).file
        };
    }

    private logSuccess(response: { code: number }, username: string, message: string): void {
        if (response.code === 200) {
            logger.info(`User ${username} ${message}`);
        }
    }
}
