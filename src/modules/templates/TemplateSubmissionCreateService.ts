import { SubmittedTemplateStatus } from "../../interfaces/SubmittedTemplate";
import { User } from "../../interfaces/User";
import { SubmittedTemplateModel } from "../../orm/schemas/SubmittedTemplateSchemas";
import { VMTemplateModel } from "../../orm/schemas/VM/VMTemplateSchemas";
import { createResponse, resp } from "../../utils/resp";
import { validateObjectIdInput } from "../common/ObjectIdPolicy";

type TemplateSubmissionTemplateRepository = {
    findById(templateId: string): Promise<any | null>;
};

type SubmittedTemplateRepository = {
    create(payload: Record<string, unknown>): Promise<any>;
};

type TemplateSubmissionCreateServiceDeps = {
    templateRepo?: TemplateSubmissionTemplateRepository;
    submittedTemplateRepo?: SubmittedTemplateRepository;
    now?: () => Date;
};

const defaultTemplateRepo: TemplateSubmissionTemplateRepository = {
    findById: (templateId) => VMTemplateModel.findById(templateId).exec()
};

const defaultSubmittedTemplateRepo: SubmittedTemplateRepository = {
    create: async (payload) => {
        const submittedTemplate = new SubmittedTemplateModel(payload);
        await submittedTemplate.save();
        return submittedTemplate;
    }
};

export class TemplateSubmissionCreateService {
    private readonly templateRepo: TemplateSubmissionTemplateRepository;
    private readonly submittedTemplateRepo: SubmittedTemplateRepository;
    private readonly now: () => Date;

    constructor(deps: TemplateSubmissionCreateServiceDeps = {}) {
        this.templateRepo = deps.templateRepo ?? defaultTemplateRepo;
        this.submittedTemplateRepo = deps.submittedTemplateRepo ?? defaultSubmittedTemplateRepo;
        this.now = deps.now ?? (() => new Date());
    }

    public async submitTemplate(input: {
        user: User;
        body: Record<string, unknown>;
    }): Promise<resp<string | undefined>> {
        const templateIdResult = validateObjectIdInput(input.body.template_id, "template_id");
        if (!templateIdResult.valid) {
            return createResponse(400, templateIdResult.message);
        }
        const normalizedTemplateId = templateIdResult.value;

        const template = await this.templateRepo.findById(normalizedTemplateId);
        if (!template) {
            return createResponse(404, "Template not found");
        }

        await this.submittedTemplateRepo.create({
            status: SubmittedTemplateStatus.not_approved,
            template_id: template._id,
            submitter_user_id: input.user._id,
            submitted_date: this.now()
        });

        return createResponse(200, "Template submitted successfully", template._id?.toString());
    }
}

export const templateSubmissionCreateService = new TemplateSubmissionCreateService();
