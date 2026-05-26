import { Request } from "express";
import { Service } from "../abstract/Service";
import { logger } from "../middlewares/log";
import { validateTokenAndGetAdminUser } from "../utils/auth";
import { createResponse, resp } from "../utils/resp";
import { classManagementService } from "../modules/courses/ClassManagementService";

export class ClassService extends Service {
    public async getClassById(Request: Request): Promise<resp<any>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<string>(Request);
            if (error) {
                return error;
            }

            return classManagementService.getClassById({
                user,
                classId: Request.params.classId
            });
        } catch (err) {
            logger.error("Error in getClassById:", err);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async UpdateClassById(Request: Request): Promise<resp<string | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<string>(Request);
            if (error) {
                return error;
            }

            return classManagementService.updateClassById({
                user,
                classId: Request.params.classId,
                body: Request.body
            });
        } catch (err) {
            logger.error("Error in UpdateClassById:", err);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async DeleteClassById(Request: Request): Promise<resp<string | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<string>(Request);
            if (error) {
                return error;
            }

            return classManagementService.deleteClassById({
                user,
                classId: Request.params.classId
            });
        } catch (err) {
            logger.error("Error in DeleteClassById:", err);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async AddClassToCourse(Request: Request): Promise<resp<String | { class_id: string } | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<String>(Request);
            if (error) {
                return error;
            }

            return classManagementService.addClassToCourse({
                user,
                courseId: Request.params.courseId,
                body: Request.body
            });
        } catch (err) {
            logger.error("Error in AddClassToCourse:", err);
            return createResponse(500, "Internal Server Error");
        }
    }
}
