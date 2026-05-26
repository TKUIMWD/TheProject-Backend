import { SubmittedBoxStatus } from "../../interfaces/SubmittedBox";
import { User } from "../../interfaces/User";
import { VMBasicConfig } from "../../interfaces/VM/VM";
import { logger } from "../../middlewares/log";
import { VMUtils } from "../../utils/VMUtils";
import { sendBoxAuditResultEmail } from "../../utils/MailSender/BoxAuditResultSender";
import { createResponse, resp } from "../../utils/resp";
import { userRepository } from "../users/UserRepository";
import { vmTemplateRepository } from "../vm/VMTemplateRepository";
import { vmBoxRepository } from "./VMBoxRepository";
import { vmBoxSubmissionRepository } from "./VMBoxSubmissionRepository";
import {
    buildApprovedVMBoxPayload,
    buildVMBoxAuditEmailPayload,
    buildVMBoxSubmissionAuditUpdate,
    validateVMBoxSubmissionAuditRequest
} from "./VMBoxSubmissionAuditPolicy";

type SubmittedBoxDocument = {
    _id?: unknown;
    status: SubmittedBoxStatus;
    vmtemplate_id: string;
    submitter_user_id: string;
    submitted_date: Date;
    status_updated_date?: Date;
    reject_reason?: string;
    save(): Promise<unknown>;
    [key: string]: unknown;
};

type VMBoxSubmissionAuditVMUtils = {
    getBasicQemuConfig(node: string, vmid: string): Promise<resp<VMBasicConfig | undefined>>;
};

type VMBoxSubmissionAuditServiceDeps = {
    submissionRepo?: {
        findById(submissionId: string): Promise<SubmittedBoxDocument | null>;
    };
    templateRepo?: {
        findById(templateId: string): Promise<any | null>;
    };
    boxRepo?: {
        createBoxDocument(payload: unknown): { _id?: unknown; save(): Promise<unknown> };
    };
    userRepo?: {
        findById(userId: string): Promise<{ email?: string } | null>;
    };
    vmUtils?: VMBoxSubmissionAuditVMUtils;
    sendAuditResultEmail?: (toMail: string, boxDescription: string, status: string, rejectReason?: string) => Promise<unknown> | unknown;
    now?: () => Date;
};

export class VMBoxSubmissionAuditService {
    private readonly submissionRepo: NonNullable<VMBoxSubmissionAuditServiceDeps["submissionRepo"]>;
    private readonly templateRepo: NonNullable<VMBoxSubmissionAuditServiceDeps["templateRepo"]>;
    private readonly boxRepo: NonNullable<VMBoxSubmissionAuditServiceDeps["boxRepo"]>;
    private readonly userRepo: NonNullable<VMBoxSubmissionAuditServiceDeps["userRepo"]>;
    private readonly vmUtils: VMBoxSubmissionAuditVMUtils;
    private readonly sendAuditResultEmail: NonNullable<VMBoxSubmissionAuditServiceDeps["sendAuditResultEmail"]>;
    private readonly now: () => Date;

    constructor(deps: VMBoxSubmissionAuditServiceDeps = {}) {
        this.submissionRepo = deps.submissionRepo ?? vmBoxSubmissionRepository;
        this.templateRepo = deps.templateRepo ?? vmTemplateRepository;
        this.boxRepo = deps.boxRepo ?? vmBoxRepository;
        this.userRepo = deps.userRepo ?? userRepository;
        this.vmUtils = deps.vmUtils ?? VMUtils;
        this.sendAuditResultEmail = deps.sendAuditResultEmail ?? sendBoxAuditResultEmail;
        this.now = deps.now ?? (() => new Date());
    }

    public async auditBoxSubmission(input: {
        user: User;
        body: { submission_id?: unknown; status?: unknown; reject_reason?: unknown };
    }): Promise<resp<string | undefined>> {
        const auditRequest = validateVMBoxSubmissionAuditRequest(input.body);
        if (!auditRequest.valid) {
            return createResponse(400, auditRequest.message);
        }

        const submittedBox = await this.submissionRepo.findById(auditRequest.submissionId);
        if (!submittedBox) {
            return createResponse(404, "Submitted box not found");
        }

        const auditUpdate = buildVMBoxSubmissionAuditUpdate(auditRequest.status, auditRequest.rejectReason, this.now());
        submittedBox.status = auditUpdate.status;
        submittedBox.status_updated_date = auditUpdate.status_updated_date;
        submittedBox.reject_reason = auditUpdate.reject_reason;
        await submittedBox.save();

        const template = await this.templateRepo.findById(submittedBox.vmtemplate_id);
        if (!template) {
            return createResponse(404, "Template not found for the submitted box");
        }

        const templateQemu = await this.vmUtils.getBasicQemuConfig(template.pve_node, template.pve_vmid);
        if (!templateQemu) {
            return createResponse(404, "QEMU config not found for the template");
        }

        if (auditRequest.status === SubmittedBoxStatus.approved) {
            const newBox = this.boxRepo.createBoxDocument(buildApprovedVMBoxPayload(submittedBox, this.now()));
            await newBox.save();

            logger.info(`Submission ${auditRequest.submissionId} approved and VMBox ${newBox._id} created by ${input.user.email}`);
            await this.sendResultEmail({
                submitterUserId: submittedBox.submitter_user_id,
                status: SubmittedBoxStatus.approved,
                templateName: templateQemu.body?.name
            });
            logger.info(`Box approved successfully: ${submittedBox._id}, VMBox created: ${newBox._id}`);
        } else if (auditRequest.status === SubmittedBoxStatus.rejected) {
            logger.info(`Submission ${auditRequest.submissionId} rejected by ${input.user.email}`);
            await this.sendResultEmail({
                submitterUserId: submittedBox.submitter_user_id,
                status: SubmittedBoxStatus.rejected,
                rejectReason: auditRequest.rejectReason,
                templateName: templateQemu.body?.name
            });
        }

        return createResponse(200, "Box audit status updated successfully", submittedBox._id?.toString());
    }

    private async sendResultEmail(input: {
        submitterUserId: string;
        status: SubmittedBoxStatus.approved | SubmittedBoxStatus.rejected;
        rejectReason?: string;
        templateName?: string;
    }): Promise<void> {
        const submitterUser = await this.userRepo.findById(input.submitterUserId);
        if (!submitterUser?.email) return;

        try {
            const emailPayload = buildVMBoxAuditEmailPayload(input);
            await this.sendAuditResultEmail(submitterUser.email, emailPayload.templateName, emailPayload.status, emailPayload.message);
            logger.info(`${input.status === SubmittedBoxStatus.approved ? "Approval" : "Rejection"} notification sent to ${submitterUser.email}`);
        } catch (emailError) {
            logger.error(`Failed to send ${input.status === SubmittedBoxStatus.approved ? "approval" : "rejection"} notification email:`, emailError);
        }
    }
}

export const vmBoxSubmissionAuditService = new VMBoxSubmissionAuditService();
