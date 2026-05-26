import { User } from "../../interfaces/User";
import { VMConfig } from "../../interfaces/VM/VM";
import { logger } from "../../middlewares/log";
import { UsedComputeResourceModel } from "../../orm/schemas/UsedComputeResourceSchemas";
import { UsersModel } from "../../orm/schemas/UserSchemas";
import { VMTemplateModel } from "../../orm/schemas/VM/VMTemplateSchemas";
import { PVEUtils } from "../../utils/PVEUtils";
import { VMUtils } from "../../utils/VMUtils";
import { createResponse, resp } from "../../utils/resp";
import { validateObjectIdInput } from "../common/ObjectIdPolicy";

type TemplateDeletionRepository = {
    findById(templateId: string): Promise<any | null>;
    deleteById(templateId: string): Promise<unknown>;
};

type TemplateDeletionUserRepository = {
    findById(userId: string): Promise<any | null>;
    pullOwnedTemplate(userId: string, templateId: string): Promise<unknown>;
};

type TemplateResourceRepository = {
    incrementUsedResource(resourceId: string, update: { cpu_cores: number; memory: number; storage: number }): Promise<unknown>;
};

type TemplateVMUtils = {
    getCurrentVMConfig(node: string, vmid: string): Promise<VMConfig | null>;
    deleteTemplate(node: string, vmid: string): Promise<{ success: boolean; upid?: string; errorMessage?: string }>;
    waitForTaskCompletion(node: string, upid: string, label: string): Promise<{ success: boolean; errorMessage?: string }>;
};

type TemplateDeletionServiceDeps = {
    templateRepo?: TemplateDeletionRepository;
    userRepo?: TemplateDeletionUserRepository;
    resourceRepo?: TemplateResourceRepository;
    vmUtils?: TemplateVMUtils;
    extractDiskSize?: (diskConfig?: string) => number | null;
};

const defaultTemplateRepo: TemplateDeletionRepository = {
    findById: (templateId) => VMTemplateModel.findById(templateId).exec(),
    deleteById: (templateId) => VMTemplateModel.deleteOne({ _id: templateId }).exec()
};

const defaultUserRepo: TemplateDeletionUserRepository = {
    findById: (userId) => UsersModel.findById(userId).exec(),
    pullOwnedTemplate: (userId, templateId) => UsersModel.updateOne(
        { _id: userId },
        { $pull: { owned_templates: templateId } }
    ).exec()
};

const defaultResourceRepo: TemplateResourceRepository = {
    incrementUsedResource: (resourceId, update) => UsedComputeResourceModel.updateOne(
        { _id: resourceId },
        { $inc: update }
    ).exec()
};

export class TemplateDeletionService {
    private readonly templateRepo: TemplateDeletionRepository;
    private readonly userRepo: TemplateDeletionUserRepository;
    private readonly resourceRepo: TemplateResourceRepository;
    private readonly vmUtils: TemplateVMUtils;
    private readonly extractDiskSize: (diskConfig?: string) => number | null;

    constructor(deps: TemplateDeletionServiceDeps = {}) {
        this.templateRepo = deps.templateRepo ?? defaultTemplateRepo;
        this.userRepo = deps.userRepo ?? defaultUserRepo;
        this.resourceRepo = deps.resourceRepo ?? defaultResourceRepo;
        this.vmUtils = deps.vmUtils ?? VMUtils;
        this.extractDiskSize = deps.extractDiskSize ?? PVEUtils.extractDiskSizeFromConfig;
    }

    public async deleteTemplate(input: {
        user: User;
        templateId: unknown;
    }): Promise<resp<string | undefined>> {
        const templateIdResult = validateObjectIdInput(input.templateId, "template_id");
        if (!templateIdResult.valid) {
            return createResponse(400, templateIdResult.message);
        }
        const normalizedTemplateId = templateIdResult.value;

        const template = await this.templateRepo.findById(normalizedTemplateId);
        if (!template) {
            return createResponse(404, "Template not found");
        }

        if (template.owner !== input.user._id!.toString() && input.user.role !== 'superadmin') {
            return createResponse(403, "Access denied: You don't have permission to delete this template");
        }

        let templateConfig: VMConfig | null = null;
        try {
            logger.info(`[deleteTemplate] Checking template existence in PVE: node=${template.pve_node}, vmid=${template.pve_vmid}`);
            templateConfig = await this.vmUtils.getCurrentVMConfig(template.pve_node, template.pve_vmid);
            if (templateConfig) {
                logger.info(`[deleteTemplate] Retrieved template config for resource reclaim: cores=${templateConfig.cores}, memory=${templateConfig.memory}, disk size=${this.extractDiskSize(templateConfig.scsi0)}GB`);
            }
        } catch (configError) {
            logger.warn(`[deleteTemplate] Failed to get template config for resource reclaim: ${configError}`);
            logger.warn("[deleteTemplate] Template may not exist in PVE or is inaccessible");
        }

        try {
            const deleteResult = await this.vmUtils.deleteTemplate(template.pve_node, template.pve_vmid);
            if (!deleteResult.success) {
                return createResponse(500, `Failed to delete template from PVE: ${deleteResult.errorMessage}`);
            }

            if (deleteResult.upid) {
                logger.info(`[deleteTemplate] Waiting for deletion task completion, UPID: ${deleteResult.upid}`);
                const waitResult = await this.vmUtils.waitForTaskCompletion(template.pve_node, deleteResult.upid, 'Template deletion');
                logger.debug(`[deleteTemplate] Wait result received: success=${waitResult.success}`);

                if (!waitResult.success) {
                    return createResponse(500, `Template deletion failed: ${waitResult.errorMessage}`);
                }

                logger.info("[deleteTemplate] Template deletion task completed successfully");
            } else {
                logger.info("[deleteTemplate] Template deletion completed immediately (no UPID)");
            }
        } catch (pveError) {
            logger.error("Error deleting template from PVE:", pveError);
            return createResponse(500, `Failed to delete template from PVE system: ${pveError instanceof Error ? pveError.message : 'Unknown error'}`);
        }

        if (templateConfig) {
            try {
                await this.reclaimTemplateResourcesWithConfig(template.owner, templateConfig);
                logger.info(`[deleteTemplate] Successfully reclaimed resources for user ${template.owner}`);
            } catch (resourceError) {
                logger.error(`[deleteTemplate] Error reclaiming resources for user ${template.owner}:`, resourceError);
            }
        } else {
            logger.warn("[deleteTemplate] No template config available for resource reclaim");
        }

        await this.userRepo.pullOwnedTemplate(template.owner, normalizedTemplateId);
        await this.templateRepo.deleteById(normalizedTemplateId);

        return createResponse(200, "Template deleted successfully", normalizedTemplateId);
    }

    private async reclaimTemplateResourcesWithConfig(userId: string, templateConfig: VMConfig): Promise<void> {
        const user = await this.userRepo.findById(userId);
        if (!user || !user.used_compute_resource_id) {
            logger.error(`User ${userId} not found or no used compute resource ID`);
            return;
        }

        const diskSize = this.extractDiskSize(templateConfig.scsi0);
        await this.resourceRepo.incrementUsedResource(user.used_compute_resource_id, {
            cpu_cores: -templateConfig.cores,
            memory: -templateConfig.memory,
            storage: diskSize ? -diskSize : 0
        });

        logger.info(`Successfully reclaimed template resources for user ${userId}: CPU=${templateConfig.cores}, Memory=${templateConfig.memory}MB, Disk=${diskSize}GB`);
    }
}

export const templateDeletionService = new TemplateDeletionService();
