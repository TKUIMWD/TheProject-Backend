import { User } from "../../interfaces/User";
import { VMBasicConfig } from "../../interfaces/VM/VM";
import { logger } from "../../middlewares/log";
import { SubmittedTemplateModel } from "../../orm/schemas/SubmittedTemplateSchemas";
import { UsersModel } from "../../orm/schemas/UserSchemas";
import { VMTemplateModel } from "../../orm/schemas/VM/VMTemplateSchemas";
import { PVEUtils } from "../../utils/PVEUtils";
import { VMUtils } from "../../utils/VMUtils";
import { sendTemplateAuditResultEmail } from "../../utils/MailSender/TemplateAuditResultSender";
import { createResponse, resp } from "../../utils/resp";
import { SubmittedTemplateStatus } from "../../interfaces/SubmittedTemplate";
import { validateTemplateSubmissionAuditRequest } from "./TemplateSubmissionAuditPolicy";

type SubmittedTemplateDocument = {
    _id?: unknown;
    status: SubmittedTemplateStatus;
    template_id: string;
    submitter_user_id: string;
    submitted_date: Date;
    status_updated_date?: Date;
    reject_reason?: string;
    save(): Promise<unknown>;
};

type VMTemplateDocument = {
    _id?: unknown;
    description: string;
    pve_vmid: string;
    pve_node: string;
    owner: string;
    ciuser: string;
    cipassword: string;
};

type TemplateAuditSubmittedRepository = {
    findById(submittedTemplateId: string): Promise<SubmittedTemplateDocument | null>;
};

type TemplateAuditTemplateRepository = {
    findById(templateId: string): Promise<VMTemplateDocument | null>;
    createApprovedTemplate(payload: {
        description: string;
        pve_vmid: string;
        pve_node: string;
        submitter_user_id: string;
        submitted_date: Date;
        owner: string;
        ciuser: string;
        cipassword: string;
        is_public: boolean;
    }): Promise<{ _id?: unknown }>;
};

type TemplateAuditUserRepository = {
    findById(userId: string): Promise<{ email?: string } | null>;
    addOwnedTemplate(userId: string, templateId: unknown): Promise<unknown>;
};

type TemplateAuditVMUtils = {
    getBasicQemuConfig(node: string, vmid: string): Promise<resp<VMBasicConfig | undefined>>;
    getNextVMId(): Promise<resp<{ data?: string } | undefined>>;
    getTemplateInfo(node: string, vmid: string): Promise<resp<{ name?: string } | undefined>>;
    cloneVM(sourceNode: string, sourceVmid: string, newVmid: string, vmName: string, targetNode: string, storage: string, full: string): Promise<{ success: boolean; upid?: string; errorMessage?: string }>;
    waitForTaskCompletion(node: string, upid: string, label: string): Promise<{ success: boolean; errorMessage?: string }>;
};

type TemplateAuditServiceDeps = {
    submittedTemplateRepo?: TemplateAuditSubmittedRepository;
    templateRepo?: TemplateAuditTemplateRepository;
    userRepo?: TemplateAuditUserRepository;
    vmUtils?: TemplateAuditVMUtils;
    sanitizeVMName?: (name: string) => string | null;
    sendAuditResultEmail?: (toMail: string, templateName: string, status: string, rejectReason?: string) => void;
    now?: () => Date;
    sleep?: (milliseconds: number) => Promise<void>;
};

const defaultSubmittedTemplateRepo: TemplateAuditSubmittedRepository = {
    findById: (submittedTemplateId) => SubmittedTemplateModel.findById(submittedTemplateId).exec()
};

const defaultTemplateRepo: TemplateAuditTemplateRepository = {
    findById: (templateId) => VMTemplateModel.findById(templateId).exec(),
    createApprovedTemplate: async (payload) => {
        const template = new VMTemplateModel(payload);
        await template.save();
        return template;
    }
};

const defaultUserRepo: TemplateAuditUserRepository = {
    findById: (userId) => UsersModel.findById(userId).exec(),
    addOwnedTemplate: (userId, templateId) => UsersModel.updateOne(
        { _id: userId },
        { $addToSet: { owned_templates: templateId } }
    ).exec()
};

export class TemplateAuditService {
    private readonly submittedTemplateRepo: TemplateAuditSubmittedRepository;
    private readonly templateRepo: TemplateAuditTemplateRepository;
    private readonly userRepo: TemplateAuditUserRepository;
    private readonly vmUtils: TemplateAuditVMUtils;
    private readonly sanitizeVMName: (name: string) => string | null;
    private readonly sendAuditResultEmail: (toMail: string, templateName: string, status: string, rejectReason?: string) => void;
    private readonly now: () => Date;
    private readonly sleep: (milliseconds: number) => Promise<void>;

    constructor(deps: TemplateAuditServiceDeps = {}) {
        this.submittedTemplateRepo = deps.submittedTemplateRepo ?? defaultSubmittedTemplateRepo;
        this.templateRepo = deps.templateRepo ?? defaultTemplateRepo;
        this.userRepo = deps.userRepo ?? defaultUserRepo;
        this.vmUtils = deps.vmUtils ?? VMUtils;
        this.sanitizeVMName = deps.sanitizeVMName ?? PVEUtils.sanitizeVMName;
        this.sendAuditResultEmail = deps.sendAuditResultEmail ?? sendTemplateAuditResultEmail;
        this.now = deps.now ?? (() => new Date());
        this.sleep = deps.sleep ?? ((milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds)));
    }

    public async auditSubmittedTemplate(input: {
        user: User;
        body: { template_id?: unknown; status?: unknown; reject_reason?: unknown };
    }): Promise<resp<string | undefined>> {
        const auditRequest = validateTemplateSubmissionAuditRequest(input.body);
        if (!auditRequest.valid) {
            return createResponse(400, auditRequest.message);
        }

        const submittedTemplate = await this.submittedTemplateRepo.findById(auditRequest.submittedTemplateId);
        if (!submittedTemplate) {
            return createResponse(404, "Submitted template not found");
        }

        submittedTemplate.status = auditRequest.status;
        submittedTemplate.status_updated_date = this.now();
        submittedTemplate.reject_reason = auditRequest.status === SubmittedTemplateStatus.rejected
            ? auditRequest.rejectReason || "No reason provided"
            : undefined;
        await submittedTemplate.save();

        const template = await this.templateRepo.findById(submittedTemplate.template_id);
        if (!template) {
            return createResponse(404, "Template not found for the submitted template");
        }

        const submittedTemplateQemu = await this.vmUtils.getBasicQemuConfig(template.pve_node, template.pve_vmid);
        if (!submittedTemplateQemu) {
            return createResponse(404, "Failed to retrieve submitted template QEMU config");
        }
        logger.debug(`Loaded submitted template QEMU config for template ${template._id}`);

        if (auditRequest.status === SubmittedTemplateStatus.approved) {
            const approvalResult = await this.approveSubmittedTemplate({
                submittedTemplate,
                originalTemplate: template,
                superAdminUser: input.user
            });
            if (approvalResult.code !== 200) {
                return approvalResult;
            }

            await this.sendResultEmail({
                submitterUserId: submittedTemplate.submitter_user_id,
                templateName: submittedTemplateQemu.body?.name || "unknown",
                status: "approved"
            });
        } else if (auditRequest.status === SubmittedTemplateStatus.rejected) {
            await this.sendResultEmail({
                submitterUserId: submittedTemplate.submitter_user_id,
                templateName: submittedTemplateQemu.body?.name || "unknown",
                status: "rejected",
                rejectReason: auditRequest.rejectReason || "No reason provided"
            });
        }

        return createResponse(200, "Template audit status updated successfully", submittedTemplate._id?.toString());
    }

    private async approveSubmittedTemplate(input: {
        submittedTemplate: SubmittedTemplateDocument;
        originalTemplate: VMTemplateDocument;
        superAdminUser: User;
    }): Promise<resp<undefined>> {
        const nextIdResult = await this.vmUtils.getNextVMId();
        if (nextIdResult.code !== 200 || !nextIdResult.body) {
            logger.error(`Failed to get next VM ID for approved template: ${nextIdResult.message}`);
            return createResponse(500, `Failed to get next VM ID: ${nextIdResult.message}`);
        }
        const newTemplateVmid = nextIdResult.body.data;
        if (!newTemplateVmid) {
            logger.error("Failed to get next VM ID for approved template: missing data");
            return createResponse(500, "Failed to get next VM ID: missing data");
        }

        logger.info(`Starting clone operation: source=${input.originalTemplate.pve_vmid} on ${input.originalTemplate.pve_node}, target=${newTemplateVmid}`);

        const originalTemplateConfig = await this.vmUtils.getTemplateInfo(input.originalTemplate.pve_node, input.originalTemplate.pve_vmid);
        if (originalTemplateConfig.code !== 200 || !originalTemplateConfig.body) {
            logger.error(`Failed to get original template config: ${originalTemplateConfig.message}`);
            return createResponse(500, `Failed to get original template config: ${originalTemplateConfig.message}`);
        }

        const originalTemplateName = originalTemplateConfig.body.name || input.originalTemplate.description;
        const currentDate = this.now().toISOString().split("T")[0];
        const rawTemplateName = `${currentDate}-${originalTemplateName}`;
        const sanitizedTemplateName = this.sanitizeVMName(rawTemplateName);
        if (!sanitizedTemplateName) {
            logger.error(`Failed to sanitize template name: ${rawTemplateName}`);
            return createResponse(500, `Invalid template name format: ${rawTemplateName}`);
        }

        logger.info(`Prepared approved template clone name: ${sanitizedTemplateName}`);

        const cloneResult = await this.vmUtils.cloneVM(
            input.originalTemplate.pve_node,
            input.originalTemplate.pve_vmid,
            newTemplateVmid,
            sanitizedTemplateName,
            input.originalTemplate.pve_node,
            "NFS",
            "1"
        );

        logger.debug(`Clone result received for approved template: success=${cloneResult.success}, hasUpid=${Boolean(cloneResult.upid)}`);

        if (!cloneResult.success) {
            logger.error(`Failed to clone template in PVE: ${cloneResult.errorMessage}`);
            return createResponse(500, `Failed to clone template in PVE: ${cloneResult.errorMessage}`);
        }

        const cloneCompletionResult = await this.ensureCloneCompleted(input.originalTemplate.pve_node, newTemplateVmid, cloneResult.upid);
        if (cloneCompletionResult.code !== 200) {
            return cloneCompletionResult;
        }

        const newApprovedTemplate = await this.templateRepo.createApprovedTemplate({
            description: `[Approved] ${input.originalTemplate.description}`,
            pve_vmid: newTemplateVmid,
            pve_node: input.originalTemplate.pve_node,
            submitter_user_id: input.submittedTemplate.submitter_user_id,
            submitted_date: input.submittedTemplate.submitted_date,
            owner: input.superAdminUser._id!.toString(),
            ciuser: input.originalTemplate.ciuser,
            cipassword: input.originalTemplate.cipassword,
            is_public: true
        });

        await this.userRepo.addOwnedTemplate(input.superAdminUser._id!.toString(), newApprovedTemplate._id);

        return createResponse(200, "Template approval completed");
    }

    private async ensureCloneCompleted(node: string, newTemplateVmid: string, upid?: string): Promise<resp<undefined>> {
        if (upid) {
            logger.info(`Waiting for clone task completion with UPID: ${upid}`);
            const waitResult = await this.vmUtils.waitForTaskCompletion(node, upid, "Template clone for approval");
            if (!waitResult.success) {
                logger.error("Template clone task failed:", waitResult.errorMessage);
                return createResponse(500, `Template clone failed: ${waitResult.errorMessage}`);
            }
            logger.info("Clone task completed successfully");
            return createResponse(200, "Template clone completed");
        }

        logger.info("No UPID returned, assuming clone completed immediately. Waiting 3 seconds for safety...");
        await this.sleep(3000);

        try {
            const newTemplateInfo = await this.vmUtils.getTemplateInfo(node, newTemplateVmid);
            if (newTemplateInfo.code !== 200) {
                logger.error(`Failed to verify cloned template: ${newTemplateInfo.message}`);
                return createResponse(500, `Clone operation completed but failed to verify new template: ${newTemplateInfo.message}`);
            }
            logger.info(`Clone verification successful for template ${newTemplateVmid}`);
            return createResponse(200, "Template clone completed");
        } catch (verifyError) {
            logger.error("Error verifying cloned template:", verifyError);
            return createResponse(500, "Clone operation completed but verification failed");
        }
    }

    private async sendResultEmail(input: {
        submitterUserId: string;
        templateName: string;
        status: "approved" | "rejected";
        rejectReason?: string;
    }): Promise<void> {
        const submitterUser = await this.userRepo.findById(input.submitterUserId);
        if (!submitterUser?.email) return;

        this.sendAuditResultEmail(submitterUser.email, input.templateName, input.status, input.rejectReason);
    }
}

export const templateAuditService = new TemplateAuditService();
