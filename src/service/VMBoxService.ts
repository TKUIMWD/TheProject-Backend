import { Service } from "../abstract/Service";
import { SubmittedBoxStatus } from "../interfaces/SubmittedBox";
import { VM_Box_Info } from "../interfaces/VM/VM_Box";
import { logger } from "../middlewares/log";
import { vmBoxRequestAdapterService } from "../modules/vm-box/VMBoxRequestAdapterService";
import { createResponse, resp } from "../utils/resp";

export type VMBoxServiceAdapterInput = {
    user: any;
    params?: Record<string, any>;
    body?: any;
    query?: Record<string, any>;
};

export class VMBoxService extends Service {
    public submitBox(input: VMBoxServiceAdapterInput): Promise<resp<any>> {
        return vmBoxRequestAdapterService.submitBox(this.normalizeInput(input));
    }

    public getSubmittedBoxes(): Promise<resp<(VM_Box_Info & { status: SubmittedBoxStatus })[] | undefined>> {
        return vmBoxRequestAdapterService.listSubmittedBoxes();
    }

    public auditBoxSubmission(input: VMBoxServiceAdapterInput): Promise<resp<string | undefined>> {
        return vmBoxRequestAdapterService.auditBoxSubmission(this.normalizeInput(input));
    }

    public rateBox(input: VMBoxServiceAdapterInput): Promise<resp<any>> {
        return vmBoxRequestAdapterService.rateBox(this.normalizeInput(input));
    }

    public getPublicBoxes(): Promise<resp<VM_Box_Info[] | undefined>> {
        return this.run("getPublicBoxes", () => vmBoxRequestAdapterService.listPublicBoxes());
    }

    public getPendingBoxes(): Promise<resp<VM_Box_Info[] | undefined>> {
        return vmBoxRequestAdapterService.listPendingBoxes();
    }

    public updateBoxAiAssistantSetting(input: VMBoxServiceAdapterInput): Promise<resp<any>> {
        return vmBoxRequestAdapterService.updateBoxAiAssistantSetting(this.normalizeInput(input));
    }

    public getBoxReviews(input: VMBoxServiceAdapterInput): Promise<resp<any>> {
        return vmBoxRequestAdapterService.getBoxReviews(this.normalizeInput(input));
    }

    public updateBoxReview(input: VMBoxServiceAdapterInput): Promise<resp<any>> {
        return vmBoxRequestAdapterService.updateBoxReview(this.normalizeInput(input));
    }

    public deleteBoxReview(input: VMBoxServiceAdapterInput): Promise<resp<any>> {
        return vmBoxRequestAdapterService.deleteBoxReview(this.normalizeInput(input));
    }

    public submitBoxWriteup(input: VMBoxServiceAdapterInput): Promise<resp<any>> {
        return vmBoxRequestAdapterService.submitBoxWriteup(this.normalizeInput(input));
    }

    public getPublicBoxWriteups(input: VMBoxServiceAdapterInput): Promise<resp<any>> {
        return this.run("getPublicBoxWriteups", () => {
            return vmBoxRequestAdapterService.getPublicBoxWriteups(this.normalizeInput(input));
        });
    }

    public getMyBoxWriteups(input: VMBoxServiceAdapterInput): Promise<resp<any>> {
        return vmBoxRequestAdapterService.getMyBoxWriteups(this.normalizeInput(input));
    }

    public getBoxWriteupSubmissions(input: VMBoxServiceAdapterInput): Promise<resp<any>> {
        return vmBoxRequestAdapterService.getBoxWriteupSubmissions(this.normalizeInput(input));
    }

    public reviewBoxWriteup(input: VMBoxServiceAdapterInput): Promise<resp<any>> {
        return vmBoxRequestAdapterService.reviewBoxWriteup(this.normalizeInput(input));
    }

    public updateBoxWriteupVisibility(input: VMBoxServiceAdapterInput): Promise<resp<any>> {
        return vmBoxRequestAdapterService.updateBoxWriteupVisibility(this.normalizeInput(input));
    }

    public getMyAnswerRecord(input: VMBoxServiceAdapterInput): Promise<resp<any>> {
        return vmBoxRequestAdapterService.getMyAnswerRecord(this.normalizeInput(input));
    }

    public submitBoxAnswer(input: VMBoxServiceAdapterInput): Promise<resp<any>> {
        return vmBoxRequestAdapterService.submitBoxAnswer(this.normalizeInput(input));
    }

    private normalizeInput(input: VMBoxServiceAdapterInput): Required<VMBoxServiceAdapterInput> {
        return {
            user: input.user,
            params: input.params ?? {},
            body: input.body ?? {},
            query: input.query ?? {}
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
