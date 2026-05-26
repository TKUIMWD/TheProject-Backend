import { User } from "../../interfaces/User";
import { logger } from "../../middlewares/log";
import { UsersModel } from "../../orm/schemas/UserSchemas";
import { VMModel } from "../../orm/schemas/VM/VMSchemas";
import { VMTemplateModel } from "../../orm/schemas/VM/VMTemplateSchemas";
import { PVEUtils } from "../../utils/PVEUtils";
import { VMUtils } from "../../utils/VMUtils";
import { createResponse, resp } from "../../utils/resp";
import { validateObjectIdInput } from "../common/ObjectIdPolicy";

type TemplateConversionVMRepository = {
    findByIdAndOwner(vmId: string, ownerId: string): Promise<any | null>;
    deleteById(vmId: string): Promise<unknown>;
};

type TemplateConversionTemplateRepository = {
    findById(templateId: string): Promise<any | null>;
    create(payload: Record<string, unknown>): Promise<any>;
};

type TemplateConversionUserRepository = {
    moveVMToTemplate(userId: string, vmId: string, templateId: unknown): Promise<unknown>;
};

type TemplateConversionVMUtils = {
    validateVMCreationParams(params: {
        template_id: string;
        name: string;
        target: string;
        cpuCores: number;
        memorySize: number;
        diskSize: number;
        ciuser?: string;
        cipassword?: string;
    }): Promise<resp<unknown>>;
    getVMStatus(node: string, vmid: string): Promise<{ status?: string } | null>;
    convertVMToTemplate(node: string, vmid: string, templateName?: string): Promise<{ success: boolean; upid?: string; errorMessage?: string }>;
    waitForTaskCompletion(node: string, upid: string, label: string): Promise<{ success: boolean; errorMessage?: string }>;
};

type TemplateConversionServiceDeps = {
    vmRepo?: TemplateConversionVMRepository;
    templateRepo?: TemplateConversionTemplateRepository;
    userRepo?: TemplateConversionUserRepository;
    vmUtils?: TemplateConversionVMUtils;
    sanitizeVMName?: (name: string) => string | null;
};

const defaultVMRepo: TemplateConversionVMRepository = {
    findByIdAndOwner: (vmId, ownerId) => VMModel.findOne({ _id: vmId, owner: ownerId }).exec(),
    deleteById: (vmId) => VMModel.deleteOne({ _id: vmId }).exec()
};

const defaultTemplateRepo: TemplateConversionTemplateRepository = {
    findById: (templateId) => VMTemplateModel.findById(templateId).exec(),
    create: async (payload) => {
        const template = new VMTemplateModel(payload);
        await template.save();
        return template;
    }
};

const defaultUserRepo: TemplateConversionUserRepository = {
    moveVMToTemplate: (userId, vmId, templateId) => UsersModel.updateOne(
        { _id: userId },
        {
            $pull: { owned_vms: vmId },
            $push: { owned_templates: templateId }
        }
    ).exec()
};

export class TemplateConversionService {
    private readonly vmRepo: TemplateConversionVMRepository;
    private readonly templateRepo: TemplateConversionTemplateRepository;
    private readonly userRepo: TemplateConversionUserRepository;
    private readonly vmUtils: TemplateConversionVMUtils;
    private readonly sanitizeVMName: (name: string) => string | null;

    constructor(deps: TemplateConversionServiceDeps = {}) {
        this.vmRepo = deps.vmRepo ?? defaultVMRepo;
        this.templateRepo = deps.templateRepo ?? defaultTemplateRepo;
        this.userRepo = deps.userRepo ?? defaultUserRepo;
        this.vmUtils = deps.vmUtils ?? VMUtils;
        this.sanitizeVMName = deps.sanitizeVMName ?? PVEUtils.sanitizeVMName;
    }

    public async convertVMToTemplate(input: {
        user: User;
        body: Record<string, unknown>;
    }): Promise<resp<string | undefined>> {
        const { vm_id, ciuser, cipassword, description, template_name } = input.body;

        if (!vm_id || !ciuser || !cipassword || !description) {
            return createResponse(400, "Missing required fields: vm_id, ciuser, cipassword, description");
        }

        const vmIdResult = validateObjectIdInput(vm_id, "vm_id");
        if (!vmIdResult.valid) {
            return createResponse(400, vmIdResult.message);
        }
        const normalizedVmId = vmIdResult.value;

        const validateResult = await this.vmUtils.validateVMCreationParams({
            template_id: "dummy",
            name: "dummy",
            target: "dummy",
            cpuCores: 1,
            memorySize: 1024,
            diskSize: 10,
            ciuser: ciuser as string,
            cipassword: cipassword as string
        });
        if (validateResult.code !== 200) {
            return createResponse(400, `CI validation failed: ${validateResult.message}`);
        }

        const userId = input.user._id!.toString();
        const ownedVM = await this.vmRepo.findByIdAndOwner(normalizedVmId, userId);
        if (!ownedVM) {
            return createResponse(404, "VM not found or you don't have permission to convert this VM");
        }

        logger.debug(`Converting VM ${normalizedVmId} to template; fromTemplateId=${ownedVM.fromTemplateId || "[NONE]"}`);

        if (ownedVM.fromTemplateId) {
            const sourceTemplate = await this.templateRepo.findById(ownedVM.fromTemplateId.toString());
            if (sourceTemplate && !sourceTemplate.is_public && sourceTemplate.owner.toString() !== userId) {
                return createResponse(403, "Cannot convert VM to template: source template is private");
            }
        }

        const node = ownedVM.pve_node;
        const vmid = ownedVM.pve_vmid;
        const vmStatus = await this.vmUtils.getVMStatus(node, vmid);
        if (!vmStatus) {
            return createResponse(500, "Failed to get VM status");
        }
        if (vmStatus.status !== "stopped") {
            return createResponse(400, "VM must be stopped before converting to template");
        }

        let finalTemplateName: string | undefined = undefined;
        if (typeof template_name === "string" && template_name.trim()) {
            const sanitizedName = this.sanitizeVMName(template_name.trim());
            if (!sanitizedName) {
                return createResponse(400, "Invalid template name: name contains invalid characters or is too long");
            }
            finalTemplateName = sanitizedName;
        }

        const convertResult = await this.vmUtils.convertVMToTemplate(node, vmid, finalTemplateName);
        if (!convertResult.success) {
            logger.error("Failed to convert VM to template:", convertResult.errorMessage);
            return createResponse(500, `Failed to convert VM to template: ${convertResult.errorMessage}`);
        }

        if (convertResult.upid) {
            const waitResult = await this.vmUtils.waitForTaskCompletion(node, convertResult.upid, "VM to template conversion");
            if (!waitResult.success) {
                logger.error("Template conversion task failed:", waitResult.errorMessage);
                return createResponse(500, `Template conversion failed: ${waitResult.errorMessage}`);
            }
        }

        const newTemplate = await this.templateRepo.create({
            description,
            pve_vmid: vmid,
            pve_node: node,
            owner: input.user._id,
            ciuser,
            cipassword,
            is_public: false
        });

        await this.userRepo.moveVMToTemplate(userId, normalizedVmId, newTemplate._id);
        await this.vmRepo.deleteById(ownedVM._id);

        return createResponse(200, "VM successfully converted to template", newTemplate._id?.toString());
    }
}

export const templateConversionService = new TemplateConversionService();
