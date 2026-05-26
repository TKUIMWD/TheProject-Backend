import { Service } from "../abstract/Service";
import { SubmittedBoxStatus } from "../interfaces/SubmittedBox";
import { VM_Box_Info } from "../interfaces/VM/VM_Box";
import { logger } from "../middlewares/log";
import { vmBoxRequestAdapterService } from "../modules/vm-box/VMBoxRequestAdapterService";
import { validateTokenAndGetAdminUser, validateTokenAndGetSuperAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { createResponse, resp } from "../utils/resp";
import { Request } from "express";

type TokenValidator = <T>(request: Request) => Promise<{ user: any; error?: resp<T | undefined> }>;
type VMBoxServiceAdapterInput = {
    user: any;
    params: Request["params"];
    body: any;
    query: Request["query"];
};

export class VMBoxService extends Service {
    public submitBox(Request: Request): Promise<resp<any>> {
        return this.withAdminInput(Request, "submitBox", "admin", (input) => vmBoxRequestAdapterService.submitBox(input));
    }

    public getSubmittedBoxes(Request: Request): Promise<resp<(VM_Box_Info & { status: SubmittedBoxStatus })[] | undefined>> {
        return this.withSuperAdminInput(Request, "getSubmittedBoxes", "super admin", () => {
            return vmBoxRequestAdapterService.listSubmittedBoxes();
        });
    }

    public auditBoxSubmission(Request: Request): Promise<resp<string | undefined>> {
        return this.withSuperAdminInput(Request, "auditBoxSubmission", "super admin", (input) =>
            vmBoxRequestAdapterService.auditBoxSubmission(input)
        );
    }

    public rateBox(Request: Request): Promise<resp<any>> {
        return this.withUserInput(Request, "rateBox", "token", (input) => vmBoxRequestAdapterService.rateBox(input));
    }

    public getPublicBoxes(_Request: Request): Promise<resp<VM_Box_Info[] | undefined>> {
        return this.run("getPublicBoxes", () => vmBoxRequestAdapterService.listPublicBoxes());
    }

    public getPendingBoxes(Request: Request): Promise<resp<VM_Box_Info[] | undefined>> {
        return this.withSuperAdminInput(Request, "getPendingBoxes", "super admin", () => {
            return vmBoxRequestAdapterService.listPendingBoxes();
        });
    }

    public updateBoxAiAssistantSetting(Request: Request): Promise<resp<any>> {
        return this.withAdminInput(Request, "updateBoxAiAssistantSetting", "admin", (input) =>
            vmBoxRequestAdapterService.updateBoxAiAssistantSetting(input)
        );
    }

    public getBoxReviews(Request: Request): Promise<resp<any>> {
        return this.withUserInput(Request, "getBoxReviews", "token", (input) => vmBoxRequestAdapterService.getBoxReviews(input));
    }

    public updateBoxReview(Request: Request): Promise<resp<any>> {
        return this.withUserInput(Request, "updateBoxReview", "token", (input) => vmBoxRequestAdapterService.updateBoxReview(input));
    }

    public deleteBoxReview(Request: Request): Promise<resp<any>> {
        return this.withUserInput(Request, "deleteBoxReview", "token", (input) => vmBoxRequestAdapterService.deleteBoxReview(input));
    }

    public submitBoxWriteup(Request: Request): Promise<resp<any>> {
        return this.withUserInput(Request, "submitBoxWriteup", "token", (input) => vmBoxRequestAdapterService.submitBoxWriteup(input));
    }

    public getPublicBoxWriteups(Request: Request): Promise<resp<any>> {
        return this.run("getPublicBoxWriteups", () => {
            return vmBoxRequestAdapterService.getPublicBoxWriteups(this.toAdapterInput(Request, undefined));
        });
    }

    public getMyBoxWriteups(Request: Request): Promise<resp<any>> {
        return this.withUserInput(Request, "getMyBoxWriteups", "token", (input) => vmBoxRequestAdapterService.getMyBoxWriteups(input));
    }

    public getBoxWriteupSubmissions(Request: Request): Promise<resp<any>> {
        return this.withAdminInput(Request, "getBoxWriteupSubmissions", "admin", (input) =>
            vmBoxRequestAdapterService.getBoxWriteupSubmissions(input)
        );
    }

    public reviewBoxWriteup(Request: Request): Promise<resp<any>> {
        return this.withAdminInput(Request, "reviewBoxWriteup", "admin", (input) => vmBoxRequestAdapterService.reviewBoxWriteup(input));
    }

    public updateBoxWriteupVisibility(Request: Request): Promise<resp<any>> {
        return this.withAdminInput(Request, "updateBoxWriteupVisibility", "admin", (input) =>
            vmBoxRequestAdapterService.updateBoxWriteupVisibility(input)
        );
    }

    public getMyAnswerRecord(Request: Request): Promise<resp<any>> {
        return this.withUserInput(Request, "getMyAnswerRecord", "token", (input) => vmBoxRequestAdapterService.getMyAnswerRecord(input));
    }

    public submitBoxAnswer(Request: Request): Promise<resp<any>> {
        return this.withUserInput(Request, "submitBoxAnswer", "token", (input) => vmBoxRequestAdapterService.submitBoxAnswer(input));
    }

    private withUserInput<T>(
        Request: Request,
        operationName: string,
        validationLabel: string,
        action: (input: VMBoxServiceAdapterInput) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        return this.withAuthenticatedInput(Request, validateTokenAndGetUser, operationName, validationLabel, action);
    }

    private withAdminInput<T>(
        Request: Request,
        operationName: string,
        validationLabel: string,
        action: (input: VMBoxServiceAdapterInput) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        return this.withAuthenticatedInput(Request, validateTokenAndGetAdminUser, operationName, validationLabel, action);
    }

    private withSuperAdminInput<T>(
        Request: Request,
        operationName: string,
        validationLabel: string,
        action: (input: VMBoxServiceAdapterInput) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        return this.withAuthenticatedInput(Request, validateTokenAndGetSuperAdminUser, operationName, validationLabel, action);
    }

    private async withAuthenticatedInput<T>(
        Request: Request,
        validator: TokenValidator,
        operationName: string,
        validationLabel: string,
        action: (input: VMBoxServiceAdapterInput) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        return this.run(operationName, async () => {
            const { user, error } = await validator<T>(Request);
            if (error) {
                logger.error(`Error validating ${validationLabel} token:`, error);
                return error;
            }
            return action(this.toAdapterInput(Request, user));
        });
    }

    private toAdapterInput(Request: Request, user: any): VMBoxServiceAdapterInput {
        return {
            user,
            params: Request.params,
            body: Request.body,
            query: Request.query
        };
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
