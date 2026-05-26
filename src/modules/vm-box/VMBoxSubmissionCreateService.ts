import { SubmittedBoxStatus } from "../../interfaces/SubmittedBox";
import { User } from "../../interfaces/User";
import { logger } from "../../middlewares/log";
import { createResponse, resp } from "../../utils/resp";
import { vmTemplateRepository } from "../vm/VMTemplateRepository";
import { vmBoxSubmissionRepository } from "./VMBoxSubmissionRepository";
import {
    buildVMBoxSubmissionCreatePayload,
    buildVMBoxSubmissionCreateResponse,
    validateVMBoxSubmissionCreateRequest
} from "./VMBoxSubmissionCreatePolicy";

type VMBoxSubmissionCreateServiceDeps = {
    templateRepo?: {
        findById(templateId: string): Promise<any | null>;
    };
    submissionRepo?: {
        createSubmissionDocument(payload: unknown): {
            _id?: unknown;
            submitted_date: Date;
            save(): Promise<unknown>;
        };
    };
};

export class VMBoxSubmissionCreateService {
    private readonly templateRepo: NonNullable<VMBoxSubmissionCreateServiceDeps["templateRepo"]>;
    private readonly submissionRepo: NonNullable<VMBoxSubmissionCreateServiceDeps["submissionRepo"]>;

    constructor(deps: VMBoxSubmissionCreateServiceDeps = {}) {
        this.templateRepo = deps.templateRepo ?? vmTemplateRepository;
        this.submissionRepo = deps.submissionRepo ?? vmBoxSubmissionRepository;
    }

    public async submitBox(input: {
        user: User;
        request: {
            vmtemplate_id?: unknown;
            box_setup_description?: unknown;
            flag_answers?: unknown;
            allow_ai_assistant?: unknown;
            design_md?: unknown;
            setup_md?: unknown;
            writeup_md?: unknown;
        };
    }): Promise<resp<any>> {
        const submissionRequest = validateVMBoxSubmissionCreateRequest(input.request);
        if (!submissionRequest.valid) {
            return createResponse(400, submissionRequest.message);
        }

        const template = await this.templateRepo.findById(submissionRequest.fields.vmtemplate_id);
        if (!template) {
            return createResponse(404, "Template not found");
        }

        const newSubmission = this.submissionRepo.createSubmissionDocument(buildVMBoxSubmissionCreatePayload({
            fields: submissionRequest.fields,
            submitterUserId: input.user._id!.toString(),
            status: SubmittedBoxStatus.not_approved
        }));

        await newSubmission.save();

        logger.info(`Box submission created by admin ${input.user.email}, Submission ID: ${newSubmission._id}`);
        return createResponse(200, "Box submission created successfully, waiting for approval", buildVMBoxSubmissionCreateResponse({
            submissionId: newSubmission._id,
            vmtemplateId: submissionRequest.fields.vmtemplate_id,
            submittedDate: newSubmission.submitted_date,
            submitterEmail: input.user.email
        }));
    }
}

export const vmBoxSubmissionCreateService = new VMBoxSubmissionCreateService();
