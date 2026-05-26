import { Service } from "../abstract/Service";
import { ChapterPageDTO } from "../interfaces/Chapter/ChapterPageDTO";
import { validateTokenAndGetAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { resp, createResponse } from "../utils/resp"
import { Request } from "express";
import { logger } from "../middlewares/log";
import { chapterManagementService } from "../modules/courses/ChapterManagementService";

export class ChapterService extends Service {
    /**
     * @param Request
     * @returns resp<ChapterPageDTO | undefined>
     */
    public async getChapterById(Request: Request): Promise<resp<ChapterPageDTO | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<ChapterPageDTO>(Request);
            if (error) {
                return error;
            }

            return chapterManagementService.getChapterById({
                user,
                chapterId: Request.params.chapterId
            });

        } catch (err) {
            logger.error("Error in getChapterById:", err);
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * @description Deletes a chapter by its ID and handles all related data consistency.
     * @param Request Express request object containing the chapterId.
     * @returns A promise resolving to a success or error response.
     */
    public async DeleteChapterById(Request: Request): Promise<resp<string | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<string>(Request);
            if (error) {
                return error;
            }

            return chapterManagementService.deleteChapterById({
                user,
                chapterId: Request.params.chapterId
            });

        } catch (err) {
            logger.error("Error in DeleteChapterById:", err);
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * @description Updates a chapter's information by its ID.
     * @param Request Express request object containing the chapterId and update data.
     * @returns A promise resolving to a success or error response.
     */
    public async UpdateChapterById(Request: Request): Promise<resp<string | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<string>(Request);
            if (error) {
                return error;
            }

            return chapterManagementService.updateChapterById({
                user,
                chapterId: Request.params.chapterId,
                body: Request.body
            });

        } catch (err) {
            logger.error("Error in UpdateChapterById:", err);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async AddChapterToClass(Request: Request): Promise<resp<String | { chapter_id: string } | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<String>(Request);
            if (error) {
                return error;
            }

            return chapterManagementService.addChapterToClass({
                user,
                classId: Request.params.classId,
                body: Request.body
            });
        } catch (error) {
            logger.error("Error in AddChapterToClass:", error);
            return createResponse(500, "Internal Server Error");
        }
    }
}
