import { logger } from "../../middlewares/log";
import { VMUtils } from "../../utils/VMUtils";
import { resp } from "../../utils/resp";
import {
    buildDefaultVMBoxTemplateInfo,
    buildVMBoxTemplateInfoFromQemuConfig,
    VMBoxTemplateInfo
} from "./VMBoxListDTOFactory";

type VMBoxTemplateInfoVMUtils = {
    getTemplateInfo(node: string, vmid: string): Promise<resp<any>>;
};

type VMBoxTemplateInfoServiceDeps = {
    vmUtils?: VMBoxTemplateInfoVMUtils;
};

export class VMBoxTemplateInfoService {
    private readonly vmUtils: VMBoxTemplateInfoVMUtils;

    constructor(deps: VMBoxTemplateInfoServiceDeps = {}) {
        this.vmUtils = deps.vmUtils ?? VMUtils;
    }

    public async buildTemplateInfo(
        template: any | undefined,
        fallbackDescription: string,
        options: { useTemplateOwnerOnError?: boolean } = {}
    ): Promise<VMBoxTemplateInfo> {
        const templateInfo = buildDefaultVMBoxTemplateInfo(fallbackDescription);
        if (!template) return templateInfo;

        try {
            const configResp = await this.vmUtils.getTemplateInfo(template.pve_node, template.pve_vmid);
            if (configResp.code === 200 && configResp.body) {
                return buildVMBoxTemplateInfoFromQemuConfig(template, configResp.body, fallbackDescription);
            }
        } catch (configError) {
            logger.warn(`Failed to get config for template ${template._id}:`, configError);
            if (options.useTemplateOwnerOnError && typeof template.owner === "string") {
                templateInfo.owner = template.owner;
            }
        }

        return templateInfo;
    }
}

export const vmBoxTemplateInfoService = new VMBoxTemplateInfoService();
