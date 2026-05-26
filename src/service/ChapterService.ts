import { Service } from "../abstract/Service";
import { ChapterPageDTO } from "../interfaces/Chapter/ChapterPageDTO";
import { validateTokenAndGetAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { resp, createResponse } from "../utils/resp"
import { Request } from "express";
import { logger } from "../middlewares/log";
import { courseStructureRequestAdapterService } from "../modules/courses/CourseStructureRequestAdapterService";

export class ChapterService extends Service {
    /**
     * @param Request
     * @returns resp<ChapterPageDTO | undefined>
     */
    public async getChapterById(Request: Request): Promise<resp<ChapterPageDTO | undefined>> {
        return this.withUser(Request, "getChapterById", (user) => courseStructureRequestAdapterService.getChapterById({
            user,
            params: Request.params
        }));
    }

    /**
     * @description Deletes a chapter by its ID and handles all related data consistency.
     * @param Request Express request object containing the chapterId.
     * @returns A promise resolving to a success or error response.
     */
    public async DeleteChapterById(Request: Request): Promise<resp<string | undefined>> {
        return this.withAdminUser(Request, "DeleteChapterById", (user) => courseStructureRequestAdapterService.deleteChapterById({
            user,
            params: Request.params
        }));
    }

    /**
     * @description Updates a chapter's information by its ID.
     * @param Request Express request object containing the chapterId and update data.
     * @returns A promise resolving to a success or error response.
     */
    public async UpdateChapterById(Request: Request): Promise<resp<string | undefined>> {
        return this.withAdminUser(Request, "UpdateChapterById", (user) => courseStructureRequestAdapterService.updateChapterById({
            user,
            params: Request.params,
            body: Request.body
        }));
    }

    public async AddChapterToClass(Request: Request): Promise<resp<String | { chapter_id: string } | undefined>> {
        return this.withAdminUser(Request, "AddChapterToClass", (user) => courseStructureRequestAdapterService.addChapterToClass({
            user,
            params: Request.params,
            body: Request.body
        }));
    }

    private async withUser<T>(
        Request: Request,
        actionName: string,
        action: (user: any) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<T>(Request);
            if (error) {
                return error;
            }

            return action(user);
        } catch (err) {
            logger.error(`Error in ${actionName}:`, err);
            return createResponse(500, "Internal Server Error");
        }
    }

    private async withAdminUser<T>(
        Request: Request,
        actionName: string,
        action: (user: any) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<T>(Request);
            if (error) {
                return error;
            }

            return action(user);
        } catch (err) {
            logger.error(`Error in ${actionName}:`, err);
            return createResponse(500, "Internal Server Error");
        }
    }
}
