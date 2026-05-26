import { Service } from "../abstract/Service";
import { SubmittedBoxStatus } from "../interfaces/SubmittedBox";
import { VM_Box_Info } from "../interfaces/VM/VM_Box";
import { logger } from "../middlewares/log";
import { vmBoxRequestAdapterService } from "../modules/vm-box/VMBoxRequestAdapterService";
import { validateTokenAndGetAdminUser, validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { createResponse, resp } from "../utils/resp";
import { Request } from "express";

type TokenValidator = <T>(request: Request) => Promise<{ user: any; error?: resp<T | undefined> }>;

export class VMBoxService extends Service {
    public submitBox(Request: Request): Promise<resp<any>> {
        return this.withAdmin(Request, "submitBox", "admin", (user) => {
            return vmBoxRequestAdapterService.submitBox({ user, body: Request.body });
        });
    }

    public getSubmittedBoxes(Request: Request): Promise<resp<(VM_Box_Info & { status: SubmittedBoxStatus })[] | undefined>> {
        return this.withSuperAdmin(Request, "getSubmittedBoxes", "super admin", () => {
            return vmBoxRequestAdapterService.listSubmittedBoxes();
        });
    }

    public auditBoxSubmission(Request: Request): Promise<resp<string | undefined>> {
        return this.withSuperAdmin(Request, "auditBoxSubmission", "super admin", (user) => {
            return vmBoxRequestAdapterService.auditBoxSubmission({ user, body: Request.body });
        });
    }

    public rateBox(Request: Request): Promise<resp<any>> {
        return this.withUser(Request, "rateBox", "token", (user) => {
            return vmBoxRequestAdapterService.rateBox({ user, body: Request.body });
        });
    }

    public getPublicBoxes(_Request: Request): Promise<resp<VM_Box_Info[] | undefined>> {
        return this.run("getPublicBoxes", () => vmBoxRequestAdapterService.listPublicBoxes());
    }

    public getPendingBoxes(Request: Request): Promise<resp<VM_Box_Info[] | undefined>> {
        return this.withSuperAdmin(Request, "getPendingBoxes", "super admin", () => {
            return vmBoxRequestAdapterService.listPendingBoxes();
        });
    }

    public updateBoxAiAssistantSetting(Request: Request): Promise<resp<any>> {
        return this.withAdmin(Request, "updateBoxAiAssistantSetting", "admin", (user) => {
            return vmBoxRequestAdapterService.updateBoxAiAssistantSetting({ user, body: Request.body });
        });
    }

    public getBoxReviews(Request: Request): Promise<resp<any>> {
        return this.withUser(Request, "getBoxReviews", "token", (user) => {
            return vmBoxRequestAdapterService.getBoxReviews({ user, query: Request.query });
        });
    }

    public updateBoxReview(Request: Request): Promise<resp<any>> {
        return this.withUser(Request, "updateBoxReview", "token", (user) => {
            return vmBoxRequestAdapterService.updateBoxReview({
                user,
                params: Request.params,
                body: Request.body
            });
        });
    }

    public deleteBoxReview(Request: Request): Promise<resp<any>> {
        return this.withUser(Request, "deleteBoxReview", "token", (user) => {
            return vmBoxRequestAdapterService.deleteBoxReview({
                user,
                params: Request.params,
                query: Request.query
            });
        });
    }

    public submitBoxWriteup(Request: Request): Promise<resp<any>> {
        return this.withUser(Request, "submitBoxWriteup", "token", (user) => {
            return vmBoxRequestAdapterService.submitBoxWriteup({ user, body: Request.body });
        });
    }

    public getPublicBoxWriteups(Request: Request): Promise<resp<any>> {
        return this.run("getPublicBoxWriteups", () => {
            return vmBoxRequestAdapterService.getPublicBoxWriteups({ user: undefined, query: Request.query });
        });
    }

    public getMyBoxWriteups(Request: Request): Promise<resp<any>> {
        return this.withUser(Request, "getMyBoxWriteups", "token", (user) => {
            return vmBoxRequestAdapterService.getMyBoxWriteups({ user, query: Request.query });
        });
    }

    public getBoxWriteupSubmissions(Request: Request): Promise<resp<any>> {
        return this.withAdmin(Request, "getBoxWriteupSubmissions", "admin", (user) => {
            return vmBoxRequestAdapterService.getBoxWriteupSubmissions({ user, query: Request.query });
        });
    }

    public reviewBoxWriteup(Request: Request): Promise<resp<any>> {
        return this.withAdmin(Request, "reviewBoxWriteup", "admin", (user) => {
            return vmBoxRequestAdapterService.reviewBoxWriteup({
                user,
                params: Request.params,
                body: Request.body
            });
        });
    }

    public updateBoxWriteupVisibility(Request: Request): Promise<resp<any>> {
        return this.withAdmin(Request, "updateBoxWriteupVisibility", "admin", (user) => {
            return vmBoxRequestAdapterService.updateBoxWriteupVisibility({
                user,
                params: Request.params,
                body: Request.body
            });
        });
    }

    public getMyAnswerRecord(Request: Request): Promise<resp<any>> {
        return this.withUser(Request, "getMyAnswerRecord", "token", (user) => {
            return vmBoxRequestAdapterService.getMyAnswerRecord({ user, query: Request.query });
        });
    }

    public submitBoxAnswer(Request: Request): Promise<resp<any>> {
        return this.withUser(Request, "submitBoxAnswer", "token", (user) => {
            return vmBoxRequestAdapterService.submitBoxAnswer({ user, body: Request.body });
        });
    }

    private withUser<T>(
        Request: Request,
        operationName: string,
        validationLabel: string,
        action: (user: any) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        return this.withAuthenticated(Request, validateTokenAndGetUser, operationName, validationLabel, action);
    }

    private withAdmin<T>(
        Request: Request,
        operationName: string,
        validationLabel: string,
        action: (user: any) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        return this.withAuthenticated(Request, validateTokenAndGetAdminUser, operationName, validationLabel, action);
    }

    private withSuperAdmin<T>(
        Request: Request,
        operationName: string,
        validationLabel: string,
        action: (user: any) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        return this.withAuthenticated(Request, validateTokenAndGetSuperAdminUser, operationName, validationLabel, action);
    }

    private async withAuthenticated<T>(
        Request: Request,
        validator: TokenValidator,
        operationName: string,
        validationLabel: string,
        action: (user: any) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        return this.run(operationName, async () => {
            const { user, error } = await validator<T>(Request);
            if (error) {
                logger.error(`Error validating ${validationLabel} token:`, error);
                return error;
            }
            return action(user);
        });
    }

    private async run<T>(
        operationName: string,
        action: () => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        try {
            return await action();
        } catch (error) {
            logger.error(`Error in ${operationName}:`, error);
            return createResponse(500, "Internal Server Error");
        }
    }
}
