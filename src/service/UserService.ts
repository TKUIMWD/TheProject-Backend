import { Document } from "mongoose";
import { Service } from "../abstract/Service";
import { ComputeResourcePlan } from "../interfaces/ComputeResourcePlan";
import { CourseInfo } from "../interfaces/Course/Course";
import { DBResp } from "../interfaces/Response/DBResp";
import { User, UserProfile } from "../interfaces/User";
import { logger } from "../middlewares/log";
import { userProfileService } from "../modules/users/UserProfileService";
import { userReadService } from "../modules/users/UserReadService";
import { createResponse, resp } from "../utils/resp";

type AuthenticatedUser = User & {
    save(): Promise<unknown>;
};

export type UserServiceInput = {
    user: AuthenticatedUser;
    body?: any;
    params?: Record<string, any>;
    file?: Express.Multer.File;
};

export class UserService extends Service {
    public getProfile(input: UserServiceInput): Promise<resp<UserProfile | undefined>> {
        return this.withAction("getting user profile", input, (serviceInput) => {
            return Promise.resolve(userProfileService.getProfile(input.user));
        });
    }

    public updateProfile(input: UserServiceInput): Promise<resp<UserProfile | undefined>> {
        return this.withAction("updating profile", input, async (input) => {
            const response = await userProfileService.updateProfile({
                user: input.user,
                body: input.body ?? {}
            });
            this.logSuccess(response, input.user.username, "updated profile successfully");
            return response;
        });
    }

    public changePassword(input: UserServiceInput): Promise<resp<DBResp<Document> | undefined>> {
        return this.withAction("changing password", input, async (input) => {
            const response = await userProfileService.changePassword({
                user: input.user,
                body: input.body ?? {}
            });
            this.logSuccess(response, input.user.username, "changed password successfully");
            return response as resp<DBResp<Document> | undefined>;
        });
    }

    public uploadAvatar(input: UserServiceInput): Promise<resp<UserProfile | undefined>> {
        return this.withAction("uploading avatar", input, async (input) => {
            const response = await userProfileService.uploadAvatar(input);
            this.logSuccess(response, input.user.username, "uploaded avatar successfully");
            return response;
        });
    }

    public deleteAvatar(input: UserServiceInput): Promise<resp<UserProfile | undefined>> {
        return this.withAction("deleting avatar", input, async (input) => {
            const response = await userProfileService.deleteAvatar(input);
            this.logSuccess(response, input.user.username, "deleted avatar successfully");
            return response;
        });
    }

    public getUserCourses(input: UserServiceInput): Promise<resp<Array<CourseInfo> | undefined>> {
        return this.withAction("getting user courses", input, (input) => {
            return userReadService.getUserCourses(input.user);
        });
    }

    public getUserCRP(input: UserServiceInput): Promise<resp<ComputeResourcePlan | undefined>> {
        return this.withAction("getting user CRP", input, (input) => {
            return userReadService.getUserCRP(input.user);
        });
    }

    public getUserById(input: UserServiceInput): Promise<resp<UserProfile | undefined>> {
        return this.withAction("getting user by ID", input, (input) => {
            return userReadService.getUserById({
                actor: input.user,
                targetUserId: input.params?.id
            });
        });
    }

    private async withAction<T>(
        operationName: string,
        input: UserServiceInput,
        action: (input: UserServiceInput) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        try {
            return action(input);
        } catch (error) {
            logger.error(`Error ${operationName}: ${error}`);
            return createResponse(500, error instanceof Error && operationName === "uploading avatar"
                ? error.message
                : "Internal server error");
        }
    }

    private logSuccess(response: { code: number }, username: string, message: string): void {
        if (response.code === 200) {
            logger.info(`User ${username} ${message}`);
        }
    }
}
