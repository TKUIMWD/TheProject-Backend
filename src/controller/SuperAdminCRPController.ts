import { Request, Response } from "express";
import { Controller } from "../abstract/Controller";
import { User } from "../interfaces/User";
import { logger } from "../middlewares/log";
import { SuperAdminCRPService } from "../service/SuperAdminCRPService";
import { validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { createResponse, resp } from "../utils/resp";


export class SuperAdminCRPController extends Controller {

    protected service: SuperAdminCRPService;

    constructor() {
        super();
        this.service = new SuperAdminCRPService();
    }

    public async createCRP(Request: Request, Response: Response) {
        const resp = await this.withValidatedUser(Request, "createCRP", validateTokenAndGetSuperAdminUser, "Error creating CRP", (user) =>
            this.service.createCRP({
                user,
                body: Request.body,
                params: Request.params
            })
        );
        Response.status(resp.code).send(resp);
    }

    public async updateCRP(Request: Request, Response: Response) {
        const resp = await this.withValidatedUser(Request, "updateCRP", validateTokenAndGetSuperAdminUser, "Error updating CRP", (user) =>
            this.service.updateCRP({
                user,
                body: Request.body,
                params: Request.params
            })
        );
        Response.status(resp.code).send(resp);
    }

    public async deleteCRP(Request: Request, Response: Response) {
        const resp = await this.withValidatedUser(Request, "deleteCRP", validateTokenAndGetSuperAdminUser, "Error deleting CRP", (user) =>
            this.service.deleteCRP({
                user,
                params: Request.params
            })
        );
        Response.status(resp.code).send(resp);
    }

    public async getAllCRPs(Request: Request, Response: Response) {
        const resp = await this.withValidatedUser(Request, "getAllCRPs", validateTokenAndGetUser, "Error in getAllCRPs", () =>
            this.service.getAllCRPs()
        );
        Response.status(resp.code).send(resp);
    }

    public async getCRPById(Request: Request, Response: Response) {
        const resp = await this.withValidatedUser(Request, "getCRPById", validateTokenAndGetSuperAdminUser, "Error retrieving CRP", () =>
            this.service.getCRPById({
                params: Request.params
            })
        );
        Response.status(resp.code).send(resp);
    }

    private async withValidatedUser<T>(
        request: Request,
        operation: string,
        validator: (request: Request) => Promise<{ user: User; error?: resp<any> }>,
        errorLogPrefix: string,
        action: (user: User) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        try {
            const { user, error } = await validator(request);
            if (error) {
                logger.warn(`Token validation failed in ${operation}: ${error.message}`);
                return createResponse(error.code, error.message);
            }

            return action(user);
        } catch (error: any) {
            logger.error(`${errorLogPrefix}: ${error.message}`);
            return createResponse(500, `Internal Server Error: ${error.message}`);
        }
    }
}
