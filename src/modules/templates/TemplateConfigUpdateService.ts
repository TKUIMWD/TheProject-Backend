import { User } from "../../interfaces/User";
import { logger } from "../../middlewares/log";
import { VMTemplateModel } from "../../orm/schemas/VM/VMTemplateSchemas";
import { PVEUtils } from "../../utils/PVEUtils";
import { VMUtils } from "../../utils/VMUtils";
import { createResponse, resp } from "../../utils/resp";
import { validateObjectIdInput } from "../common/ObjectIdPolicy";

type TemplateConfigUpdateRepository = {
    findById(templateId: string): Promise<any | null>;
    updateOne(templateId: string, update: Record<string, unknown>): Promise<unknown>;
};

type TemplateConfigUpdateVMUtils = {
    updateVMName(node: string, vmid: string, name: string): Promise<{ success: boolean; upid?: string; errorMessage?: string }>;
    configureCloudInit(node: string, vmid: string, ciuser: string, cipassword: string): Promise<{ success: boolean; upid?: string; errorMessage?: string }>;
    waitForTaskCompletion(node: string, upid: string, label: string): Promise<{ success: boolean; errorMessage?: string }>;
};

type TemplateConfigUpdateServiceDeps = {
    templateRepo?: TemplateConfigUpdateRepository;
    vmUtils?: TemplateConfigUpdateVMUtils;
    sanitizeVMName?: (name: string) => string | null;
};

const defaultTemplateRepo: TemplateConfigUpdateRepository = {
    findById: (templateId) => VMTemplateModel.findById(templateId).exec(),
    updateOne: (templateId, update) => VMTemplateModel.updateOne({ _id: templateId }, update).exec()
};

export class TemplateConfigUpdateService {
    private readonly templateRepo: TemplateConfigUpdateRepository;
    private readonly vmUtils: TemplateConfigUpdateVMUtils;
    private readonly sanitizeVMName: (name: string) => string | null;

    constructor(deps: TemplateConfigUpdateServiceDeps = {}) {
        this.templateRepo = deps.templateRepo ?? defaultTemplateRepo;
        this.vmUtils = deps.vmUtils ?? VMUtils;
        this.sanitizeVMName = deps.sanitizeVMName ?? PVEUtils.sanitizeVMName;
    }

    public async updateTemplateConfig(input: {
        user: User;
        body: Record<string, unknown>;
    }): Promise<resp<string | undefined>> {
        const { template_id, description, is_public, template_name, ciuser, cipassword } = input.body;

        const templateIdResult = validateObjectIdInput(template_id, "template_id");
        if (!templateIdResult.valid) {
            return createResponse(400, templateIdResult.message);
        }
        const normalizedTemplateId = templateIdResult.value;

        const template = await this.templateRepo.findById(normalizedTemplateId);
        if (!template) {
            return createResponse(404, "Template not found");
        }

        const userId = input.user._id!.toString();
        if (template.owner !== userId && input.user.role !== "superadmin") {
            return createResponse(403, "Access denied: You don't have permission to update this template");
        }

        if (is_public !== undefined && input.user.role !== "superadmin") {
            return createResponse(403, "Access denied: Only superadmin can modify template public status");
        }

        const updateData: Record<string, unknown> = {};
        if (description !== undefined) {
            updateData.description = description;
        }

        if (ciuser !== undefined || cipassword !== undefined) {
            if (!ciuser || !cipassword) {
                return createResponse(400, "Both ciuser and cipassword must be provided and non-empty");
            }

            updateData.ciuser = ciuser;
            updateData.cipassword = cipassword;
        }

        if (is_public !== undefined && input.user.role === "superadmin") {
            updateData.is_public = is_public;
        }

        if (typeof template_name === "string" && template_name.trim()) {
            const sanitizedName = this.sanitizeVMName(template_name.trim());
            if (!sanitizedName) {
                return createResponse(400, "Invalid template name: name contains invalid characters or is too long");
            }

            const nameUpdateResult = await this.vmUtils.updateVMName(template.pve_node, template.pve_vmid, sanitizedName);
            if (!nameUpdateResult.success) {
                return createResponse(500, `Failed to update template name: ${nameUpdateResult.errorMessage}`);
            }

            if (nameUpdateResult.upid) {
                const waitResult = await this.vmUtils.waitForTaskCompletion(template.pve_node, nameUpdateResult.upid, "Template name update");
                if (!waitResult.success) {
                    return createResponse(500, `Template name update failed: ${waitResult.errorMessage}`);
                }
            }
        }

        if (ciuser !== undefined || cipassword !== undefined) {
            logger.info(`[updateTemplateConfig] Updating CI config for template ${normalizedTemplateId}: ciuser=${ciuser ? "[PROVIDED]" : "[EMPTY]"}, cipassword=${cipassword ? "[PROVIDED]" : "[EMPTY]"}`);

            const ciUpdateResult = await this.vmUtils.configureCloudInit(template.pve_node, template.pve_vmid, ciuser as string, cipassword as string);
            if (!ciUpdateResult.success) {
                return createResponse(500, `Failed to update template CI configuration: ${ciUpdateResult.errorMessage}`);
            }

            if (ciUpdateResult.upid) {
                const waitResult = await this.vmUtils.waitForTaskCompletion(template.pve_node, ciUpdateResult.upid, "Template CI configuration update");
                if (!waitResult.success) {
                    return createResponse(500, `Template CI configuration update failed: ${waitResult.errorMessage}`);
                }
            }
        }

        if (Object.keys(updateData).length > 0) {
            await this.templateRepo.updateOne(normalizedTemplateId, updateData);
        }

        return createResponse(200, "Template configuration updated successfully", normalizedTemplateId);
    }
}

export const templateConfigUpdateService = new TemplateConfigUpdateService();
