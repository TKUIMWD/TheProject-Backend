import { VM_Template_Info } from "../../interfaces/VM/VM_Template";
import { PVE_qemu_config } from "../../interfaces/PVE";
import { SubmittedTemplateDetails } from "../../interfaces/SubmittedTemplate";
import { User } from "../../interfaces/User";
import { logger } from "../../middlewares/log";
import { SubmittedTemplateModel } from "../../orm/schemas/SubmittedTemplateSchemas";
import { UsersModel } from "../../orm/schemas/UserSchemas";
import { VMTemplateModel } from "../../orm/schemas/VM/VMTemplateSchemas";
import { VMUtils } from "../../utils/VMUtils";
import { createResponse, resp } from "../../utils/resp";
import {
    buildMissingSubmittedTemplateDetails,
    buildSubmittedTemplateDetails,
    buildTemplateDocumentMap,
    buildTemplateInfoDTO,
    buildTemplateSubmitterInfoMap,
    collectSubmittedTemplateTemplateIds,
    collectSubmittedTemplateUserIds,
    collectTemplateSubmitterIds,
    getTemplateDocument,
    getTemplateSubmitterInfo
} from "./TemplateListDTOFactory";

type TemplateRepositoryPort = {
    listAll(): Promise<any[]>;
    listAccessible(userId: unknown): Promise<any[]>;
    listByIds(templateIds: unknown[]): Promise<any[]>;
};

type SubmittedTemplateRepositoryPort = {
    listSubmitted(): Promise<any[]>;
};

type UserRepositoryPort = {
    listByIds(userIds: unknown[]): Promise<any[]>;
};

type TemplateUtilsPort = {
    getTemplateInfo(node: string, vmid: string): Promise<resp<PVE_qemu_config | undefined>>;
};

type TemplateListServiceDeps = {
    templateRepo?: TemplateRepositoryPort;
    submittedTemplateRepo?: SubmittedTemplateRepositoryPort;
    userRepo?: UserRepositoryPort;
    templateUtils?: TemplateUtilsPort;
};

const defaultTemplateRepo: TemplateRepositoryPort = {
    listAll: () => VMTemplateModel.find().exec(),
    listAccessible: (userId) => VMTemplateModel.find({
        $or: [
            { is_public: true },
            { owner: userId }
        ]
    }).exec(),
    listByIds: (templateIds) => VMTemplateModel.find({ _id: { $in: templateIds } }).exec()
};

const defaultSubmittedTemplateRepo: SubmittedTemplateRepositoryPort = {
    listSubmitted: () => SubmittedTemplateModel.find({}).sort({ submitted_date: -1 }).exec()
};

const defaultUserRepo: UserRepositoryPort = {
    listByIds: (userIds) => UsersModel.find({ _id: { $in: userIds } }).lean().exec()
};

const defaultTemplateUtils: TemplateUtilsPort = {
    getTemplateInfo: (node, vmid) => VMUtils.getTemplateInfo(node, vmid)
};

export class TemplateListService {
    private readonly templateRepo: TemplateRepositoryPort;
    private readonly submittedTemplateRepo: SubmittedTemplateRepositoryPort;
    private readonly userRepo: UserRepositoryPort;
    private readonly templateUtils: TemplateUtilsPort;

    constructor(deps: TemplateListServiceDeps = {}) {
        this.templateRepo = deps.templateRepo ?? defaultTemplateRepo;
        this.submittedTemplateRepo = deps.submittedTemplateRepo ?? defaultSubmittedTemplateRepo;
        this.userRepo = deps.userRepo ?? defaultUserRepo;
        this.templateUtils = deps.templateUtils ?? defaultTemplateUtils;
    }

    public async listAllTemplates(): Promise<resp<VM_Template_Info[] | undefined>> {
        const templates = await this.templateRepo.listAll();
        if (templates.length === 0) {
            return createResponse(200, "No templates found", []);
        }

        const vmTemplateInfos = await this.buildTemplateInfoList(templates);
        return createResponse(200, "Templates fetched successfully", vmTemplateInfos);
    }

    public async listAccessibleTemplates(user: User): Promise<resp<VM_Template_Info[] | undefined>> {
        const templates = await this.templateRepo.listAccessible(user._id);
        if (templates.length === 0) {
            return createResponse(200, "No approved templates found", []);
        }

        const vmTemplateInfos = await this.buildTemplateInfoList(templates);
        return createResponse(200, "Approved templates fetched successfully", vmTemplateInfos);
    }

    public async listSubmittedTemplates(): Promise<resp<SubmittedTemplateDetails[] | undefined>> {
        const submittedTemplates = await this.submittedTemplateRepo.listSubmitted();
        if (!submittedTemplates || submittedTemplates.length === 0) {
            return createResponse(200, "No submitted templates found", []);
        }

        const templates = await this.templateRepo.listByIds(collectSubmittedTemplateTemplateIds(submittedTemplates));
        const templateById = buildTemplateDocumentMap(templates);
        const submitterInfoById = buildTemplateSubmitterInfoMap(
            await this.userRepo.listByIds(collectSubmittedTemplateUserIds(submittedTemplates, templates))
        );

        const templateDetails = await Promise.all(submittedTemplates.map(async (submittedTemplate): Promise<SubmittedTemplateDetails> => {
            const submitterInfo = getTemplateSubmitterInfo(submitterInfoById, submittedTemplate.submitter_user_id);
            const template = getTemplateDocument(templateById, submittedTemplate.template_id);
            if (!template) {
                logger.warn(`Template not found for submitted template ${submittedTemplate._id}`);
                return buildMissingSubmittedTemplateDetails(submittedTemplate, submitterInfo);
            }

            const configResp = await this.getTemplateInfo(template.pve_node, template.pve_vmid);
            const qemuConfig = configResp.code === 200 && configResp.body ? configResp.body : null;

            return buildSubmittedTemplateDetails(
                submittedTemplate,
                template,
                qemuConfig,
                getTemplateSubmitterInfo(submitterInfoById, template.owner)?.username,
                submitterInfo
            );
        }));

        return createResponse(200, "Submitted templates retrieved successfully", templateDetails);
    }

    private async buildTemplateInfoList(templates: any[]): Promise<VM_Template_Info[]> {
        const submitterInfoById = buildTemplateSubmitterInfoMap(
            await this.userRepo.listByIds(collectTemplateSubmitterIds(templates))
        );

        return Promise.all(templates.map(async (template): Promise<VM_Template_Info> => {
            const configResp = await this.getTemplateInfo(template.pve_node, template.pve_vmid);
            if (configResp.code !== 200 || !configResp.body) {
                throw new Error(`Failed to get qemu config for template ${template._id}: ${configResp.message}`);
            }

            return buildTemplateInfoDTO(
                template,
                configResp.body,
                getTemplateSubmitterInfo(submitterInfoById, template.submitter_user_id)
            );
        }));
    }

    private async getTemplateInfo(node: string, vmid: string): Promise<resp<PVE_qemu_config | undefined>> {
        try {
            const templateInfoResp = await this.templateUtils.getTemplateInfo(node, vmid);
            if (templateInfoResp.code !== 200 || !templateInfoResp.body) {
                return createResponse(templateInfoResp.code, templateInfoResp.message);
            }

            return createResponse(200, "Template info fetched successfully", templateInfoResp.body);
        } catch (error) {
            logger.error(`Error in TemplateListService.getTemplateInfo for node ${node}, vmid ${vmid}:`, error);
            return createResponse(500, "Internal Server Error");
        }
    }
}

export const templateListService = new TemplateListService();
