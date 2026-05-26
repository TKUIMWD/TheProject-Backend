import { Service } from "../abstract/Service";
import { resp, createResponse } from "../utils/resp";
import { Request } from "express";
import { validateTokenAndGetUser, validateTokenAndGetSuperAdminUser, validateTokenAndGetAdminUser } from "../utils/auth";
import { VMTemplateModel } from "../orm/schemas/VM/VMTemplateSchemas";
import { VM_Template_Info } from "../interfaces/VM/VM_Template";
import { UsersModel } from "../orm/schemas/UserSchemas";
import { PVE_qemu_config } from "../interfaces/PVE";
import { VMUtils } from "../utils/VMUtils";
import { SubmittedTemplateModel } from "../orm/schemas/SubmittedTemplateSchemas";
import { SubmittedTemplateDetails } from "../interfaces/SubmittedTemplate";
import { User } from "../interfaces/User";
import { logger } from "../middlewares/log";
import { templateAuditService } from "../modules/templates/TemplateAuditService";
import {
    buildMissingSubmittedTemplateDetails,
    buildSubmittedTemplateDetails,
    buildTemplateInfoDTO,
    buildTemplateDocumentMap,
    buildTemplateSubmitterInfoMap,
    collectSubmittedTemplateTemplateIds,
    collectSubmittedTemplateUserIds,
    collectTemplateSubmitterIds,
    getTemplateDocument,
    getTemplateSubmitterInfo
} from "../modules/templates/TemplateListDTOFactory";
import { templateConversionService } from "../modules/templates/TemplateConversionService";
import { templateSubmissionCreateService } from "../modules/templates/TemplateSubmissionCreateService";

export class TemplateService extends Service {

    public async getAllTemplates(Request: Request): Promise<resp<VM_Template_Info[] | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<VM_Template_Info[]>(Request);
            if (error) {
                logger.warn(`Token validation failed in getAllTemplates: ${error.message}`);
                return error;
            }

            const templates = await VMTemplateModel.find().exec();
            if (templates.length === 0) {
                return createResponse(200, "No templates found", []);
            }
            const submitterInfoById = buildTemplateSubmitterInfoMap(
                await UsersModel.find({ _id: { $in: collectTemplateSubmitterIds(templates) } }).lean().exec()
            );

            const templateInfoPromises = templates.map(async (template): Promise<VM_Template_Info> => {
                const configResp = await this._getTemplateInfo(template.pve_node, template.pve_vmid);
                if (configResp.code !== 200 || !configResp.body) {
                    throw new Error(`Failed to get qemu config for template ${template._id}: ${configResp.message}`);
                }
                const qemuConfig = configResp.body;
                return buildTemplateInfoDTO(template, qemuConfig, getTemplateSubmitterInfo(submitterInfoById, template.submitter_user_id));
            });

            const vmTemplateInfos = await Promise.all(templateInfoPromises);
            return createResponse(200, "Templates fetched successfully", vmTemplateInfos);
        } catch (error) {
            logger.error("Error in getAllTemplates:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async getAccessableTemplates(Request: Request): Promise<resp<VM_Template_Info[] | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<VM_Template_Info[]>(Request);
            if (error) {
                logger.warn(`Token validation failed in getAccessableTemplates: ${error.message}`);
                return error;
            }

            const templates = await VMTemplateModel.find({
                $or: [
                    { is_public: true },
                    { owner: user._id }
                ]
            }).exec();
            if (templates.length === 0) {
                return createResponse(200, "No approved templates found", []);
            }
            const submitterInfoById = buildTemplateSubmitterInfoMap(
                await UsersModel.find({ _id: { $in: collectTemplateSubmitterIds(templates) } }).lean().exec()
            );

            const templateInfoPromises = templates.map(async (template): Promise<VM_Template_Info> => {
                const configResp = await this._getTemplateInfo(template.pve_node, template.pve_vmid);
                if (configResp.code !== 200 || !configResp.body) {
                    throw new Error(`Failed to get qemu config for template ${template._id}: ${configResp.message}`);
                }
                const qemuConfig = configResp.body;
                return buildTemplateInfoDTO(template, qemuConfig, getTemplateSubmitterInfo(submitterInfoById, template.submitter_user_id));
            });

            const vmTemplateInfos = await Promise.all(templateInfoPromises);
            return createResponse(200, "Approved templates fetched successfully", vmTemplateInfos);
        } catch (error) {
            logger.error("Error in getAllApprovedTemplates:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    // 私有輔助方法
    private async _getTemplateInfo(node: string, vmid: string): Promise<resp<PVE_qemu_config | undefined>> {
        try {
            const templateInfoResp = await VMUtils.getTemplateInfo(node, vmid);

            if (templateInfoResp.code !== 200 || !templateInfoResp.body) {
                return createResponse(templateInfoResp.code, templateInfoResp.message);
            }

            return createResponse(200, "Template info fetched successfully", templateInfoResp.body);
        } catch (error) {
            logger.error(`Error in _getTemplateInfo for node ${node}, vmid ${vmid}:`, error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async convertVMtoTemplate(Request: Request): Promise<resp<string | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<string>(Request);
            if (error) {
                logger.warn(`Token validation failed in convertVMtoTemplate: ${error.message}`);
                return error;
            }

            return templateConversionService.convertVMToTemplate({
                user,
                body: Request.body
            });

        } catch (error) {
            logger.error("Error in convertVMtoTemplate:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    public async submitTemplate(Request: Request): Promise<resp<string | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<string>(Request);
            if (error) {
                logger.warn(`Token validation failed in submitTemplate: ${error.message}`);
                return error;
            }

            return templateSubmissionCreateService.submitTemplate({
                user,
                body: Request.body
            });
        } catch (error) {
            logger.error("Error in submitTemplate:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * 獲取所有提交的模板 (僅限 superadmin)
     */
    public async getAllSubmittedTemplates(request: Request): Promise<resp<SubmittedTemplateDetails[] | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<User>(request);
            if (error) {
                logger.warn(`Token validation failed in getAllSubmittedTemplates: ${error.message}`);
                return createResponse(error.code, error.message);
            }

            const submittedTemplates = await SubmittedTemplateModel.find({})
                .sort({ submitted_date: -1 })
                .exec();

            if (!submittedTemplates || submittedTemplates.length === 0) {
                return createResponse(200, "No submitted templates found", []);
            }

            const templates = await VMTemplateModel.find({
                _id: { $in: collectSubmittedTemplateTemplateIds(submittedTemplates) }
            }).exec();
            const templateById = buildTemplateDocumentMap(templates);
            const submitterInfoById = buildTemplateSubmitterInfoMap(
                await UsersModel.find({
                    _id: { $in: collectSubmittedTemplateUserIds(submittedTemplates, templates) }
                }).lean().exec()
            );

            const templateDetailsPromises = submittedTemplates.map(async (submittedTemplate): Promise<SubmittedTemplateDetails> => {
                const submitterInfo = getTemplateSubmitterInfo(submitterInfoById, submittedTemplate.submitter_user_id);
                const template = getTemplateDocument(templateById, submittedTemplate.template_id);
                if (!template) {
                    logger.warn(`Template not found for submitted template ${submittedTemplate._id}`);
                    return buildMissingSubmittedTemplateDetails(submittedTemplate, submitterInfo);
                }

                const configResp = await this._getTemplateInfo(template.pve_node, template.pve_vmid);
                let qemuConfig: PVE_qemu_config | null = null;
                if (configResp.code === 200 && configResp.body) {
                    qemuConfig = configResp.body;
                }

                return buildSubmittedTemplateDetails(
                    submittedTemplate,
                    template,
                    qemuConfig,
                    getTemplateSubmitterInfo(submitterInfoById, template.owner)?.username,
                    submitterInfo
                );
            });

            const templateDetails = await Promise.all(templateDetailsPromises);
            return createResponse(200, "Submitted templates retrieved successfully", templateDetails);

        } catch (error) {
            logger.error("Error in getAllSubmittedTemplates:", error);
            return createResponse(500, "Internal Server Error");
        }
    }


    public async auditSubmittedTemplate(request: Request): Promise<resp<string | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetSuperAdminUser<User>(request);
            if (error) {
                logger.warn(`Token validation failed in auditSubmittedTemplate: ${error.message}`);
                return createResponse(error.code, error.message);
            }

            return templateAuditService.auditSubmittedTemplate({ user, body: request.body });
        } catch (error) {
            logger.error("Error in auditSubmittedTemplate:", error);
            return createResponse(500, "Internal Server Error");
        }
    }
}
