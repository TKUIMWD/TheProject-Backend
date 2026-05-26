import { SubmittedBoxStatus } from "../../interfaces/SubmittedBox";
import { VM_Box_Info } from "../../interfaces/VM/VM_Box";
import { resp } from "../../utils/resp";
import { vmBoxAiAssistantService } from "./VMBoxAiAssistantService";
import { vmBoxAnswerService } from "./VMBoxAnswerService";
import { VMBoxListService } from "./VMBoxListService";
import { vmBoxReviewService } from "./VMBoxReviewService";
import { vmBoxSubmissionAuditService } from "./VMBoxSubmissionAuditService";
import { vmBoxSubmissionCreateService } from "./VMBoxSubmissionCreateService";
import { vmBoxTemplateInfoService } from "./VMBoxTemplateInfoService";
import { vmBoxWriteupService } from "./VMBoxWriteupService";

type VMBoxAdapterInput = {
    user: any;
    params?: Record<string, any>;
    body?: any;
    query?: any;
};

export class VMBoxRequestAdapterService {
    public submitBox(input: VMBoxAdapterInput): Promise<resp<any>> {
        return vmBoxSubmissionCreateService.submitBox({ user: input.user, request: input.body });
    }

    public listSubmittedBoxes(): Promise<resp<(VM_Box_Info & { status: SubmittedBoxStatus })[] | undefined>> {
        return this.buildListService().listSubmittedBoxes();
    }

    public auditBoxSubmission(input: VMBoxAdapterInput): Promise<resp<string | undefined>> {
        return vmBoxSubmissionAuditService.auditBoxSubmission({ user: input.user, body: input.body });
    }

    public rateBox(input: VMBoxAdapterInput): Promise<resp<any>> {
        return vmBoxReviewService.createReview({ user: input.user, request: input.body });
    }

    public listPublicBoxes(): Promise<resp<VM_Box_Info[] | undefined>> {
        return this.buildListService().listPublicBoxes();
    }

    public listPendingBoxes(): Promise<resp<VM_Box_Info[] | undefined>> {
        return this.buildListService().listPendingBoxes();
    }

    public updateBoxAiAssistantSetting(input: VMBoxAdapterInput): Promise<resp<any>> {
        return vmBoxAiAssistantService.updateSetting({ user: input.user, request: input.body });
    }

    public getBoxReviews(input: VMBoxAdapterInput): Promise<resp<any>> {
        return vmBoxReviewService.listReviews({ user: input.user, request: input.query });
    }

    public updateBoxReview(input: VMBoxAdapterInput): Promise<resp<any>> {
        return vmBoxReviewService.updateReview({
            user: input.user,
            request: {
                ...input.body,
                review_id: input.params?.review_id
            }
        });
    }

    public deleteBoxReview(input: VMBoxAdapterInput): Promise<resp<any>> {
        return vmBoxReviewService.deleteReview({
            user: input.user,
            request: {
                review_id: input.params?.review_id,
                box_id: input.query?.box_id
            }
        });
    }

    public submitBoxWriteup(input: VMBoxAdapterInput): Promise<resp<any>> {
        return vmBoxWriteupService.submitWriteup({ user: input.user, request: input.body });
    }

    public getPublicBoxWriteups(input: VMBoxAdapterInput): Promise<resp<any>> {
        return vmBoxWriteupService.listPublicWriteups({ request: input.query });
    }

    public getMyBoxWriteups(input: VMBoxAdapterInput): Promise<resp<any>> {
        return vmBoxWriteupService.listMyWriteups({ user: input.user, request: input.query });
    }

    public getBoxWriteupSubmissions(input: VMBoxAdapterInput): Promise<resp<any>> {
        return vmBoxWriteupService.listSubmissionWriteups({ user: input.user, request: input.query });
    }

    public reviewBoxWriteup(input: VMBoxAdapterInput): Promise<resp<any>> {
        return vmBoxWriteupService.reviewWriteup({
            user: input.user,
            request: {
                ...input.body,
                writeup_id: input.params?.writeup_id
            }
        });
    }

    public updateBoxWriteupVisibility(input: VMBoxAdapterInput): Promise<resp<any>> {
        return vmBoxWriteupService.updateVisibility({
            user: input.user,
            request: {
                ...input.body,
                writeup_id: input.params?.writeup_id
            }
        });
    }

    public getMyAnswerRecord(input: VMBoxAdapterInput): Promise<resp<any>> {
        return vmBoxAnswerService.getMyAnswerRecord({ user: input.user, request: input.query });
    }

    public submitBoxAnswer(input: VMBoxAdapterInput): Promise<resp<any>> {
        return vmBoxAnswerService.submitAnswer({ user: input.user, request: input.body });
    }

    private buildListService(): VMBoxListService {
        return new VMBoxListService({
            resolveTemplateInfo: (template, fallbackDescription, options) =>
                vmBoxTemplateInfoService.buildTemplateInfo(template, fallbackDescription, options)
        });
    }
}

export const vmBoxRequestAdapterService = new VMBoxRequestAdapterService();
