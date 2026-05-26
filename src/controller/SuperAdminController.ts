import { Request, Response } from "express";
import { Controller } from "../abstract/Controller";
import { User } from "../interfaces/User";
import { logger } from "../middlewares/log";
import { SuperAdminService } from "../service/SuperAdminService";
import { validateTokenAndGetSuperAdminUser } from "../utils/auth";
import { createResponse, resp } from "../utils/resp";

export class SuperAdminController extends Controller {
    protected service: SuperAdminService;

    constructor() {
        super();
        this.service = new SuperAdminService();
    }

    public async changeUserRole(Request: Request, Response: Response) {
        const resp = await this.withSuperAdminActor(Request, "Error changing user role", "Internal Server Error", (actor) =>
            this.service.changeUserRole({
                actor,
                body: Request.body
            })
        );
        Response.status(resp.code).send(resp);
    }

    public async assignCRPToUser(Request: Request, Response: Response) {
        const resp = await this.withSuperAdminActor(Request, "Error assigning CRP to user", "Internal Server Error", (actor) =>
            this.service.assignCRPToUser({
                actor,
                body: Request.body
            })
        );
        Response.status(resp.code).send(resp);
    }

    public async getAllUsers(Request: Request, Response: Response) {
        const resp = await this.withSuperAdminActor(Request, "Error getting all users", "Internal server error", (actor) =>
            this.service.getAllUsers(actor)
        );
        Response.status(resp.code).send(resp);
    }

    public async getAllAdminUsers(Request: Request, Response: Response) {
        const resp = await this.withSuperAdminActor(Request, "Error getting all admin users", "Internal server error", (actor) =>
            this.service.getAllAdminUsers(actor)
        );
        Response.status(resp.code).send(resp);
    }

    private async withSuperAdminActor<T>(
        request: Request,
        errorLogPrefix: string,
        internalErrorMessage: string,
        action: (actor: User) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        try {
            const { user: actor, error } = await validateTokenAndGetSuperAdminUser<User>(request);
            if (error) {
                return createResponse(error.code, error.message);
            }

            return action(actor);
        } catch (error: any) {
            logger.error(`${errorLogPrefix}: ${error.message ?? error}`);
            return createResponse(500, error.message ? `${internalErrorMessage}: ${error.message}` : internalErrorMessage);
        }
    }
}
