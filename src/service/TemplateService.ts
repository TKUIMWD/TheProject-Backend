import { Service } from "../abstract/Service";
import { resp } from "../utils/resp";
import { VM_Template_Info } from "../interfaces/VM/VM_Template";
import { SubmittedTemplateDetails } from "../interfaces/SubmittedTemplate";
import { User } from "../interfaces/User";
import { templateRequestAdapterService } from "../modules/templates/TemplateRequestAdapterService";

export type TemplateServiceAdapterInput = { user: User; body?: any };

export class TemplateService extends Service {

    public getAllTemplates(): Promise<resp<VM_Template_Info[] | undefined>> {
        return templateRequestAdapterService.getAllTemplates();
    }

    public getAccessableTemplates(input: TemplateServiceAdapterInput): Promise<resp<VM_Template_Info[] | undefined>> {
        return templateRequestAdapterService.getAccessibleTemplates(input);
    }

    public convertVMtoTemplate(input: TemplateServiceAdapterInput): Promise<resp<string | undefined>> {
        return templateRequestAdapterService.convertVMToTemplate(input);
    }

    public submitTemplate(input: TemplateServiceAdapterInput): Promise<resp<string | undefined>> {
        return templateRequestAdapterService.submitTemplate(input);
    }

    public getAllSubmittedTemplates(): Promise<resp<SubmittedTemplateDetails[] | undefined>> {
        return templateRequestAdapterService.getAllSubmittedTemplates();
    }


    public auditSubmittedTemplate(input: TemplateServiceAdapterInput): Promise<resp<string | undefined>> {
        return templateRequestAdapterService.auditSubmittedTemplate(input);
    }
}
