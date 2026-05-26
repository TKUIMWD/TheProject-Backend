import { User } from "../../interfaces/User";
import { SubmittedTemplateDetails } from "../../interfaces/SubmittedTemplate";
import { VM_Template_Info } from "../../interfaces/VM/VM_Template";
import { resp } from "../../utils/resp";
import { templateAuditService } from "./TemplateAuditService";
import { templateConversionService } from "./TemplateConversionService";
import { templateListService } from "./TemplateListService";
import { templateSubmissionCreateService } from "./TemplateSubmissionCreateService";

type TemplateAdapterInput = {
    user: User;
    body?: any;
};

type TemplateRequestAdapterServiceDeps = {
    list?: {
        listAllTemplates(): Promise<resp<VM_Template_Info[] | undefined>>;
        listAccessibleTemplates(user: User): Promise<resp<VM_Template_Info[] | undefined>>;
        listSubmittedTemplates(): Promise<resp<SubmittedTemplateDetails[] | undefined>>;
    };
    conversion?: {
        convertVMToTemplate(input: { user: User; body: any }): Promise<resp<string | undefined>>;
    };
    submissionCreate?: {
        submitTemplate(input: { user: User; body: any }): Promise<resp<string | undefined>>;
    };
    audit?: {
        auditSubmittedTemplate(input: { user: User; body: any }): Promise<resp<string | undefined>>;
    };
};

export class TemplateRequestAdapterService {
    private readonly list: NonNullable<TemplateRequestAdapterServiceDeps["list"]>;
    private readonly conversion: NonNullable<TemplateRequestAdapterServiceDeps["conversion"]>;
    private readonly submissionCreate: NonNullable<TemplateRequestAdapterServiceDeps["submissionCreate"]>;
    private readonly audit: NonNullable<TemplateRequestAdapterServiceDeps["audit"]>;

    constructor(deps: TemplateRequestAdapterServiceDeps = {}) {
        this.list = deps.list ?? templateListService;
        this.conversion = deps.conversion ?? templateConversionService;
        this.submissionCreate = deps.submissionCreate ?? templateSubmissionCreateService;
        this.audit = deps.audit ?? templateAuditService;
    }

    public getAllTemplates(): Promise<resp<VM_Template_Info[] | undefined>> {
        return this.list.listAllTemplates();
    }

    public getAccessibleTemplates(input: TemplateAdapterInput): Promise<resp<VM_Template_Info[] | undefined>> {
        return this.list.listAccessibleTemplates(input.user);
    }

    public convertVMToTemplate(input: TemplateAdapterInput): Promise<resp<string | undefined>> {
        return this.conversion.convertVMToTemplate({
            user: input.user,
            body: input.body
        });
    }

    public submitTemplate(input: TemplateAdapterInput): Promise<resp<string | undefined>> {
        return this.submissionCreate.submitTemplate({
            user: input.user,
            body: input.body
        });
    }

    public getAllSubmittedTemplates(): Promise<resp<SubmittedTemplateDetails[] | undefined>> {
        return this.list.listSubmittedTemplates();
    }

    public auditSubmittedTemplate(input: TemplateAdapterInput): Promise<resp<string | undefined>> {
        return this.audit.auditSubmittedTemplate({
            user: input.user,
            body: input.body
        });
    }
}

export const templateRequestAdapterService = new TemplateRequestAdapterService();
