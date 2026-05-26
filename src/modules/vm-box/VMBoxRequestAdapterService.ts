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

type VMBoxListPort = {
    listSubmittedBoxes(): Promise<resp<(VM_Box_Info & { status: SubmittedBoxStatus })[] | undefined>>;
    listPublicBoxes(): Promise<resp<VM_Box_Info[] | undefined>>;
    listPendingBoxes(): Promise<resp<VM_Box_Info[] | undefined>>;
};

type VMBoxRequestAdapterServiceDeps = {
    submissionCreate?: typeof vmBoxSubmissionCreateService;
    submissionAudit?: typeof vmBoxSubmissionAuditService;
    review?: typeof vmBoxReviewService;
    aiAssistant?: typeof vmBoxAiAssistantService;
    writeup?: typeof vmBoxWriteupService;
    answer?: typeof vmBoxAnswerService;
    listFactory?: () => VMBoxListPort;
};

export class VMBoxRequestAdapterService {
    private readonly submissionCreate: NonNullable<VMBoxRequestAdapterServiceDeps["submissionCreate"]>;
    private readonly submissionAudit: NonNullable<VMBoxRequestAdapterServiceDeps["submissionAudit"]>;
    private readonly review: NonNullable<VMBoxRequestAdapterServiceDeps["review"]>;
    private readonly aiAssistant: NonNullable<VMBoxRequestAdapterServiceDeps["aiAssistant"]>;
    private readonly writeup: NonNullable<VMBoxRequestAdapterServiceDeps["writeup"]>;
    private readonly answer: NonNullable<VMBoxRequestAdapterServiceDeps["answer"]>;
    private readonly listFactory: NonNullable<VMBoxRequestAdapterServiceDeps["listFactory"]>;

    constructor(deps: VMBoxRequestAdapterServiceDeps = {}) {
        this.submissionCreate = deps.submissionCreate ?? vmBoxSubmissionCreateService;
        this.submissionAudit = deps.submissionAudit ?? vmBoxSubmissionAuditService;
        this.review = deps.review ?? vmBoxReviewService;
        this.aiAssistant = deps.aiAssistant ?? vmBoxAiAssistantService;
        this.writeup = deps.writeup ?? vmBoxWriteupService;
        this.answer = deps.answer ?? vmBoxAnswerService;
        this.listFactory = deps.listFactory ?? (() => new VMBoxListService({
            resolveTemplateInfo: (template, fallbackDescription, options) =>
                vmBoxTemplateInfoService.buildTemplateInfo(template, fallbackDescription, options)
        }));
    }

    public submitBox(input: VMBoxAdapterInput): Promise<resp<any>> {
        return this.submissionCreate.submitBox({ user: input.user, request: input.body });
    }

    public listSubmittedBoxes(): Promise<resp<(VM_Box_Info & { status: SubmittedBoxStatus })[] | undefined>> {
        return this.listFactory().listSubmittedBoxes();
    }

    public auditBoxSubmission(input: VMBoxAdapterInput): Promise<resp<string | undefined>> {
        return this.submissionAudit.auditBoxSubmission({ user: input.user, body: input.body });
    }

    public rateBox(input: VMBoxAdapterInput): Promise<resp<any>> {
        return this.review.createReview({ user: input.user, request: input.body });
    }

    public listPublicBoxes(): Promise<resp<VM_Box_Info[] | undefined>> {
        return this.listFactory().listPublicBoxes();
    }

    public listPendingBoxes(): Promise<resp<VM_Box_Info[] | undefined>> {
        return this.listFactory().listPendingBoxes();
    }

    public updateBoxAiAssistantSetting(input: VMBoxAdapterInput): Promise<resp<any>> {
        return this.aiAssistant.updateSetting({ user: input.user, request: input.body });
    }

    public getBoxReviews(input: VMBoxAdapterInput): Promise<resp<any>> {
        return this.review.listReviews({ user: input.user, request: input.query });
    }

    public updateBoxReview(input: VMBoxAdapterInput): Promise<resp<any>> {
        return this.review.updateReview({
            user: input.user,
            request: {
                ...input.body,
                review_id: input.params?.review_id
            }
        });
    }

    public deleteBoxReview(input: VMBoxAdapterInput): Promise<resp<any>> {
        return this.review.deleteReview({
            user: input.user,
            request: {
                review_id: input.params?.review_id,
                box_id: input.query?.box_id
            }
        });
    }

    public submitBoxWriteup(input: VMBoxAdapterInput): Promise<resp<any>> {
        return this.writeup.submitWriteup({ user: input.user, request: input.body });
    }

    public getPublicBoxWriteups(input: VMBoxAdapterInput): Promise<resp<any>> {
        return this.writeup.listPublicWriteups({ request: input.query });
    }

    public getMyBoxWriteups(input: VMBoxAdapterInput): Promise<resp<any>> {
        return this.writeup.listMyWriteups({ user: input.user, request: input.query });
    }

    public getBoxWriteupSubmissions(input: VMBoxAdapterInput): Promise<resp<any>> {
        return this.writeup.listSubmissionWriteups({ user: input.user, request: input.query });
    }

    public reviewBoxWriteup(input: VMBoxAdapterInput): Promise<resp<any>> {
        return this.writeup.reviewWriteup({
            user: input.user,
            request: {
                ...input.body,
                writeup_id: input.params?.writeup_id
            }
        });
    }

    public updateBoxWriteupVisibility(input: VMBoxAdapterInput): Promise<resp<any>> {
        return this.writeup.updateVisibility({
            user: input.user,
            request: {
                ...input.body,
                writeup_id: input.params?.writeup_id
            }
        });
    }

    public getMyAnswerRecord(input: VMBoxAdapterInput): Promise<resp<any>> {
        return this.answer.getMyAnswerRecord({ user: input.user, request: input.query });
    }

    public submitBoxAnswer(input: VMBoxAdapterInput): Promise<resp<any>> {
        return this.answer.submitAnswer({ user: input.user, request: input.body });
    }
}

export const vmBoxRequestAdapterService = new VMBoxRequestAdapterService();
