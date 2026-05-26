import { Request } from "express";
import { Service } from "../abstract/Service";
import { logger } from "../middlewares/log";
import { validateTokenAndGetAdminUser } from "../utils/auth";
import { createResponse, resp } from "../utils/resp";
import { courseStructureRequestAdapterService } from "../modules/courses/CourseStructureRequestAdapterService";

export class ClassService extends Service {
    public async getClassById(Request: Request): Promise<resp<any>> {
        return this.withAdminUser(Request, "getClassById", (user) => courseStructureRequestAdapterService.getClassById({
            user,
            params: Request.params
        }));
    }

    public async UpdateClassById(Request: Request): Promise<resp<string | undefined>> {
        return this.withAdminUser(Request, "UpdateClassById", (user) => courseStructureRequestAdapterService.updateClassById({
            user,
            params: Request.params,
            body: Request.body
        }));
    }

    public async DeleteClassById(Request: Request): Promise<resp<string | undefined>> {
        return this.withAdminUser(Request, "DeleteClassById", (user) => courseStructureRequestAdapterService.deleteClassById({
            user,
            params: Request.params
        }));
    }

    public async AddClassToCourse(Request: Request): Promise<resp<String | { class_id: string } | undefined>> {
        return this.withAdminUser(Request, "AddClassToCourse", (user) => courseStructureRequestAdapterService.addClassToCourse({
            user,
            params: Request.params,
            body: Request.body
        }));
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
