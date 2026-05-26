import { PVE_qemu_config } from "../../interfaces/PVE";
import { PVEResp } from "../../interfaces/Response/PVEResp";
import { User } from "../../interfaces/User";
import { VM_Template } from "../../interfaces/VM/VM_Template";
import { VMBox } from "../../orm/schemas/VM/VMBoxSchemas";
import { logger } from "../../middlewares/log";
import { createResponse, resp } from "../../utils/resp";
import { VMUtils } from "../../utils/VMUtils";
import { validateObjectIdInput } from "../common/ObjectIdPolicy";
import { selectCloudInitCredentials } from "./VMCloudInitPolicy";
import {
    buildVMCreationIdentityPolicy,
    buildVMCreationValidationParams
} from "./VMCreationRequestPolicy";
import { vmCreationSourceRepository } from "./VMCreationSourceRepository";
import { vmCreationWorkflowService } from "./VMCreationWorkflowService";
import { vmResourceAccountingService } from "./VMResourceAccountingService";

type VMCreationSourceRepositoryPort = {
    findTemplateById(templateId: string): Promise<VM_Template | null>;
    findBoxById(boxId: string): Promise<VMBox | null>;
};

type VMUtilsPort = {
    validateVMCreationParams(params: unknown): Promise<resp<string | undefined>>;
    getNextVMId(): Promise<resp<{ data: string } | undefined>>;
    getTemplateInfo(node: string, vmid: string): Promise<resp<PVE_qemu_config | undefined>>;
};

type VMResourceAccountingPort = {
    checkCreateLimits(user: User, cpuCores: number, memorySize: number, diskSize: number): Promise<resp<undefined>>;
};

type VMCreationWorkflowPort = {
    cloneConfigureAndRegisterVM(input: {
        user: User;
        templateId: string;
        templateInfo: VM_Template;
        nextId: string;
        sanitizedName: string;
        target: string;
        storage: string;
        full: string;
        cpuCores: number;
        memorySize: number;
        diskSize: number;
        ciuser?: string;
        cipassword?: string;
        boxId?: string;
    }): Promise<resp<PVEResp | undefined>>;
};

type VMCreationRequestServiceDeps = {
    sources?: VMCreationSourceRepositoryPort;
    vmUtils?: VMUtilsPort;
    resourceAccounting?: VMResourceAccountingPort;
    workflow?: VMCreationWorkflowPort;
};

export class VMCreationRequestService {
    private readonly sources: VMCreationSourceRepositoryPort;
    private readonly vmUtils: VMUtilsPort;
    private readonly resourceAccounting: VMResourceAccountingPort;
    private readonly workflow: VMCreationWorkflowPort;

    constructor(deps: VMCreationRequestServiceDeps = {}) {
        this.sources = deps.sources ?? vmCreationSourceRepository;
        this.vmUtils = deps.vmUtils ?? VMUtils;
        this.resourceAccounting = deps.resourceAccounting ?? vmResourceAccountingService;
        this.workflow = deps.workflow ?? vmCreationWorkflowService;
    }

    public async createFromTemplate(input: {
        user: User;
        body: Record<string, unknown>;
    }): Promise<resp<PVEResp | undefined>> {
        try {
            const {
                template_id,
                name,
                target,
                storage = "NFS",
                full = "1",
                cpuCores,
                memorySize,
                diskSize,
                ciuser: requestCiuser,
                cipassword: requestCipassword
            } = input.body;

            const templateIdResult = validateObjectIdInput(template_id, "template_id");
            if (!templateIdResult.valid) {
                return createResponse(400, templateIdResult.message);
            }
            const normalizedTemplateId = templateIdResult.value;

            logger.info(`User ${input.user.username} (${input.user._id}) starting VM creation from template ${normalizedTemplateId}`);

            const preparation = await this.prepareCreation({
                user: input.user,
                templateId: normalizedTemplateId,
                name,
                target,
                cpuCores,
                memorySize,
                diskSize,
                requestCiuser,
                requestCipassword
            });
            if (!preparation.ok) {
                return preparation.error;
            }

            const cloudInitCredentials = selectCloudInitCredentials({
                requestCiuser,
                requestCipassword,
                templateCiuser: preparation.templateInfo.ciuser,
                templateCipassword: preparation.templateInfo.cipassword
            });

            logger.info(`Template has valid ciuser: ${cloudInitCredentials.templateHasValidCiuser}, cipassword: ${cloudInitCredentials.templateHasValidCipassword}`);
            logger.info(`Final ciuser: "${cloudInitCredentials.ciuser}", cipassword: "${cloudInitCredentials.cipassword ? "[PROVIDED]" : "[NOT PROVIDED]"}", from template: ${cloudInitCredentials.ciuserFromTemplate}`);

            return this.workflow.cloneConfigureAndRegisterVM({
                user: input.user,
                templateId: normalizedTemplateId,
                templateInfo: preparation.templateInfo,
                nextId: preparation.nextId,
                sanitizedName: preparation.sanitizedName,
                target: String(target),
                storage: String(storage),
                full: String(full),
                cpuCores: Number(cpuCores),
                memorySize: Number(memorySize),
                diskSize: Number(diskSize),
                ciuser: cloudInitCredentials.ciuser,
                cipassword: cloudInitCredentials.cipassword
            });
        } catch (error) {
            logger.error("Error in VMCreationRequestService.createFromTemplate:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async createFromBoxTemplate(input: {
        user: User;
        body: Record<string, unknown>;
    }): Promise<resp<PVEResp | undefined>> {
        try {
            const {
                box_id,
                name,
                target,
                storage = "NFS",
                full = "1",
                cpuCores,
                memorySize,
                diskSize
            } = input.body;

            const boxIdResult = validateObjectIdInput(box_id, "box_id");
            if (!boxIdResult.valid) {
                return createResponse(400, boxIdResult.message);
            }
            const normalizedBoxId = boxIdResult.value;

            const box = await this.sources.findBoxById(normalizedBoxId);
            if (!box) {
                return createResponse(404, "Box not found");
            }

            const preparation = await this.prepareCreation({
                user: input.user,
                templateId: box.vmtemplate_id,
                name,
                target,
                cpuCores,
                memorySize,
                diskSize
            });
            if (!preparation.ok) {
                return preparation.error;
            }

            return this.workflow.cloneConfigureAndRegisterVM({
                user: input.user,
                templateId: box.vmtemplate_id,
                templateInfo: preparation.templateInfo,
                nextId: preparation.nextId,
                sanitizedName: preparation.sanitizedName,
                target: String(target),
                storage: String(storage),
                full: String(full),
                cpuCores: Number(cpuCores),
                memorySize: Number(memorySize),
                diskSize: Number(diskSize),
                boxId: box._id.toString()
            });
        } catch (error) {
            logger.error("Error in VMCreationRequestService.createFromBoxTemplate:", error);
            return createResponse(500, "Internal server error");
        }
    }

    private async prepareCreation(input: {
        user: User;
        templateId: string;
        name: unknown;
        target: unknown;
        cpuCores: unknown;
        memorySize: unknown;
        diskSize: unknown;
        requestCiuser?: unknown;
        requestCipassword?: unknown;
    }): Promise<{
        ok: true;
        templateInfo: VM_Template;
        nextId: string;
        sanitizedName: string;
    } | { ok: false; error: resp<PVEResp | undefined> }> {
        const validationResult = await this.vmUtils.validateVMCreationParams(buildVMCreationValidationParams({
            templateId: input.templateId,
            name: input.name,
            target: input.target,
            cpuCores: input.cpuCores,
            memorySize: input.memorySize,
            diskSize: input.diskSize,
            ciuser: input.requestCiuser,
            cipassword: input.requestCipassword
        }));
        if (validationResult.code !== 200) {
            logger.warn(`VM creation validation failed for user ${input.user.username}: ${validationResult.message}`);
            return { ok: false, error: validationResult };
        }

        const nextIdResult = await this.vmUtils.getNextVMId();
        if (nextIdResult.code !== 200 || !nextIdResult.body) {
            logger.error(`Failed to get next VM ID for user ${input.user.username}: ${nextIdResult.message}`);
            return { ok: false, error: nextIdResult };
        }

        const identityPolicy = buildVMCreationIdentityPolicy({
            nextId: nextIdResult.body.data,
            name: input.name
        });
        if (!identityPolicy.valid) {
            logger.warn(`Invalid VM name provided by user ${input.user.username}: ${input.name}`);
            return { ok: false, error: createResponse(400, identityPolicy.message) };
        }

        const templateResult = await this.getTemplateDetails(input.templateId);
        if (templateResult.code !== 200 || !templateResult.body) {
            logger.error(`Failed to get template details for user ${input.user.username}, template ${input.templateId}: ${templateResult.message}`);
            return { ok: false, error: templateResult };
        }

        const resourceCheckResult = await this.resourceAccounting.checkCreateLimits(
            input.user,
            Number(input.cpuCores),
            Number(input.memorySize),
            Number(input.diskSize)
        );
        if (resourceCheckResult.code !== 200) {
            logger.warn(`Resource limits exceeded for user ${input.user.username}: CPU=${input.cpuCores}, Memory=${input.memorySize}MB, Disk=${input.diskSize}GB`);
            return { ok: false, error: resourceCheckResult };
        }

        return {
            ok: true,
            templateInfo: templateResult.body.template_info,
            nextId: identityPolicy.nextId,
            sanitizedName: identityPolicy.sanitizedName
        };
    }

    private async getTemplateDetails(templateId: string): Promise<resp<{ template_info: VM_Template; qemuConfig: PVE_qemu_config } | undefined>> {
        const templateInfo = await this.sources.findTemplateById(templateId);
        if (!templateInfo) {
            return createResponse(404, "Template not found");
        }

        logger.info(`Template ${templateId} - ciuser: "${templateInfo.ciuser}", cipassword: "${templateInfo.cipassword ? "[PROVIDED]" : "[NOT PROVIDED]"}"`);
        logger.info(`Template ${templateId} - ciuser type: ${typeof templateInfo.ciuser}, cipassword type: ${typeof templateInfo.cipassword}`);

        const qemuConfigResp = await this.vmUtils.getTemplateInfo(templateInfo.pve_node, templateInfo.pve_vmid);
        if (qemuConfigResp.code !== 200 || !qemuConfigResp.body) {
            logger.error(`Failed to get qemu config for template ${templateId}: ${qemuConfigResp.message}`);
            return createResponse(qemuConfigResp.code, qemuConfigResp.message);
        }

        return createResponse(200, "Template details fetched successfully", {
            template_info: templateInfo,
            qemuConfig: qemuConfigResp.body
        });
    }
}

export const vmCreationRequestService = new VMCreationRequestService();
