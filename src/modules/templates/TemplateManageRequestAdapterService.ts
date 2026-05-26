import { CloneTemplateResponse } from "../../interfaces/Response/VMResp";
import { User } from "../../interfaces/User";
import { resp } from "../../utils/resp";
import { templateCloneService } from "./TemplateCloneService";
import { templateConfigUpdateService } from "./TemplateConfigUpdateService";
import { templateDeletionService } from "./TemplateDeletionService";

type TemplateManageRequestAdapterServiceDeps = {
    configUpdate?: {
        updateTemplateConfig(input: {
            user: User;
            body: Record<string, unknown>;
        }): Promise<resp<string | undefined>>;
    };
    deletion?: {
        deleteTemplate(input: {
            user: User;
            templateId: unknown;
        }): Promise<resp<string | undefined>>;
    };
    clone?: {
        cloneTemplate(input: {
            user: User;
            body: Record<string, unknown>;
        }): Promise<resp<CloneTemplateResponse | undefined>>;
    };
};

export class TemplateManageRequestAdapterService {
    private readonly configUpdate: NonNullable<TemplateManageRequestAdapterServiceDeps["configUpdate"]>;
    private readonly deletion: NonNullable<TemplateManageRequestAdapterServiceDeps["deletion"]>;
    private readonly clone: NonNullable<TemplateManageRequestAdapterServiceDeps["clone"]>;

    constructor(deps: TemplateManageRequestAdapterServiceDeps = {}) {
        this.configUpdate = deps.configUpdate ?? templateConfigUpdateService;
        this.deletion = deps.deletion ?? templateDeletionService;
        this.clone = deps.clone ?? templateCloneService;
    }

    public async updateTemplateConfig(input: {
        user: User;
        body: Record<string, unknown>;
    }): Promise<resp<string | undefined>> {
        return this.configUpdate.updateTemplateConfig(input);
    }

    public async deleteTemplate(input: {
        user: User;
        body: { template_id?: unknown };
    }): Promise<resp<string | undefined>> {
        return this.deletion.deleteTemplate({
            user: input.user,
            templateId: input.body.template_id
        });
    }

    public async cloneTemplate(input: {
        user: User;
        body: Record<string, unknown>;
    }): Promise<resp<CloneTemplateResponse | undefined>> {
        return this.clone.cloneTemplate(input);
    }
}

export const templateManageRequestAdapterService = new TemplateManageRequestAdapterService();
