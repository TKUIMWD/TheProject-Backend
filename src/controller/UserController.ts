import { Controller } from "../abstract/Controller";
import { Request, Response } from "express";
import { Document } from "mongoose";
import { ComputeResourcePlan } from "../interfaces/ComputeResourcePlan";
import { CourseInfo } from "../interfaces/Course/Course";
import { DBResp } from "../interfaces/Response/DBResp";
import { User, UserProfile } from "../interfaces/User";
import { logger } from "../middlewares/log";
import { UserService } from "../service/UserService";
import { validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { createResponse, resp } from "../utils/resp";

export class UserController extends Controller {
    protected service: UserService;

    constructor() {
        super();
        this.service = new UserService();
    }

    public async getProfile(Request: Request, Response: Response) {
        const resp = await this.withUserInput<UserProfile>(Request, "getting user profile", validateTokenAndGetUser, (input) =>
            this.service.getProfile(input)
        );
        Response.status(resp.code).send(resp)
    }

    public async updateProfile(Request: Request, Response: Response) {
        const resp = await this.withUserInput<UserProfile>(Request, "updating profile", validateTokenAndGetUser, (input) =>
            this.service.updateProfile(input)
        );
        Response.status(resp.code).send(resp)
    }

    public async changePassword(Request: Request, Response: Response) {
        const resp = await this.withUserInput<DBResp<Document>>(Request, "changing password", validateTokenAndGetUser, (input) =>
            this.service.changePassword(input)
        );
        Response.status(resp.code).send(resp)
    }

    public async uploadAvatar(Request: Request, Response: Response) {
        const resp = await this.withUserInput<UserProfile>(Request, "uploading avatar", validateTokenAndGetUser, (input) =>
            this.service.uploadAvatar(input)
        );
        Response.status(resp.code).send(resp);
    }

    public async deleteAvatar(Request: Request, Response: Response) {
        const resp = await this.withUserInput<UserProfile>(Request, "deleting avatar", validateTokenAndGetUser, (input) =>
            this.service.deleteAvatar(input)
        );
        Response.status(resp.code).send(resp);
    }

    public async getUserCourses(Request: Request, Response: Response) {
        const resp = await this.withUserInput<Array<CourseInfo>>(Request, "getting user courses", validateTokenAndGetUser, (input) =>
            this.service.getUserCourses(input)
        );
        Response.status(resp.code).send(resp);
    }

    public async getUserCRP(Request: Request, Response: Response) {
        const resp = await this.withUserInput<ComputeResourcePlan>(Request, "getting user CRP", validateTokenAndGetUser, (input) =>
            this.service.getUserCRP(input)
        );
        Response.status(resp.code).send(resp);
    }

    public async getUserById(Request: Request, Response: Response) {
        const resp = await this.withUserInput<UserProfile>(Request, "getting user by ID", validateTokenAndGetSuperAdminUser, (input) =>
            this.service.getUserById(input)
        );
        Response.status(resp.code).send(resp);
    }

    private async withUserInput<T>(
        Request: Request,
        operationName: string,
        validator: <R>(request: Request) => Promise<{ user: User & { save(): Promise<unknown> }; error?: resp<R | undefined> }>,
        action: (input: {
            user: User & { save(): Promise<unknown> };
            body: any;
            params: Record<string, any>;
            file?: Express.Multer.File;
        }) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        try {
            const { user, error } = await validator<T>(Request);
            if (error) return error;
            return action({
                user,
                body: Request.body,
                params: Request.params,
                file: (Request as Request & { file?: Express.Multer.File }).file
            });
        } catch (error) {
            logger.error(`Error ${operationName}: ${error}`);
            return createResponse(500, error instanceof Error && operationName === "uploading avatar"
                    ? error.message
                    : "Internal server error");
        }
    }
}
