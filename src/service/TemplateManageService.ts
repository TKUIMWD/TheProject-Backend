import { Service } from "../abstract/Service";
import { CloneTemplateResponse } from "../interfaces/Response/VMResp";
import { User } from "../interfaces/User";
import { templateManageRequestAdapterService } from "../modules/templates/TemplateManageRequestAdapterService";
import { resp } from "../utils/resp";

export type TemplateManageServiceInput = {
    user: User;
    body: any;
};

export class TemplateManageService extends Service {
    public updateTemplateConfig(input: TemplateManageServiceInput): Promise<resp<string | undefined>> {
        return templateManageRequestAdapterService.updateTemplateConfig(input);
    }

    public deleteTemplate(input: TemplateManageServiceInput): Promise<resp<string | undefined>> {
        return templateManageRequestAdapterService.deleteTemplate(input);
    }

    public cloneTemplate(input: TemplateManageServiceInput): Promise<resp<CloneTemplateResponse | undefined>> {
        return templateManageRequestAdapterService.cloneTemplate(input);
    }
}
