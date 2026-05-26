import { PVE_qemu_config } from "../../interfaces/PVE";
import { SubmittedTemplateDetails } from "../../interfaces/SubmittedTemplate";
import { VM_Template_Info } from "../../interfaces/VM/VM_Template";
import { PVEUtils } from "../../utils/PVEUtils";

export interface TemplateSubmitterInfo {
    username: string;
    email: string;
}

type TemplateSubmitterSource = {
    submitter_user_id?: unknown;
};

type TemplateSubmitterUserSource = {
    _id?: unknown;
    username?: unknown;
    email?: unknown;
};

type SubmittedTemplateSource = {
    template_id?: unknown;
    submitter_user_id?: unknown;
};

type TemplateDocumentSource = {
    _id?: unknown;
    owner?: unknown;
};

export function buildTemplateInfoDTO(
    template: any,
    qemuConfig: PVE_qemu_config,
    submitterInfo?: TemplateSubmitterInfo
): VM_Template_Info {
    const info: VM_Template_Info = {
        _id: template._id,
        name: qemuConfig.name,
        description: template.description,
        submitted_date: template.submitted_date,
        owner: template.owner,
        is_public: template.is_public,
        default_cpu_cores: PVEUtils.extractCpuCores(qemuConfig),
        default_memory_size: PVEUtils.extractMemorySize(qemuConfig),
        default_disk_size: PVEUtils.extractDiskSize(qemuConfig)
    };

    if (submitterInfo) {
        info.submitter_user_info = submitterInfo;
    }

    return info;
}

export function collectTemplateSubmitterIds(items: TemplateSubmitterSource[]): string[] {
    return Array.from(new Set(
        items
            .map((item) => item.submitter_user_id)
            .filter((id) => id !== undefined && id !== null)
            .map((id) => String(id))
            .filter((id) => id !== "")
    ));
}

export function buildTemplateSubmitterInfoMap(users: TemplateSubmitterUserSource[]): Map<string, TemplateSubmitterInfo> {
    const map = new Map<string, TemplateSubmitterInfo>();
    users.forEach((user) => {
        if (user._id === undefined || typeof user.username !== "string" || typeof user.email !== "string") {
            return;
        }
        map.set(String(user._id), {
            username: user.username,
            email: user.email
        });
    });
    return map;
}

export function getTemplateSubmitterInfo(
    submitterInfoById: Map<string, TemplateSubmitterInfo>,
    submitterUserId: unknown
): TemplateSubmitterInfo | undefined {
    if (submitterUserId === undefined || submitterUserId === null) {
        return undefined;
    }
    return submitterInfoById.get(String(submitterUserId));
}

export function collectSubmittedTemplateTemplateIds(items: SubmittedTemplateSource[]): string[] {
    return Array.from(new Set(
        items
            .map((item) => item.template_id)
            .filter((id) => id !== undefined && id !== null)
            .map((id) => String(id))
            .filter((id) => id !== "")
    ));
}

export function collectSubmittedTemplateUserIds(
    submissions: SubmittedTemplateSource[],
    templates: TemplateDocumentSource[]
): string[] {
    return Array.from(new Set([
        ...submissions.map((submission) => submission.submitter_user_id),
        ...templates.map((template) => template.owner)
    ]
        .filter((id) => id !== undefined && id !== null)
        .map((id) => String(id))
        .filter((id) => id !== "")));
}

export function buildTemplateDocumentMap<T extends TemplateDocumentSource>(templates: T[]): Map<string, T> {
    const map = new Map<string, T>();
    templates.forEach((template) => {
        if (template._id === undefined || template._id === null) {
            return;
        }
        map.set(String(template._id), template);
    });
    return map;
}

export function getTemplateDocument<T>(
    templateById: Map<string, T>,
    templateId: unknown
): T | undefined {
    if (templateId === undefined || templateId === null) {
        return undefined;
    }
    return templateById.get(String(templateId));
}

export function buildMissingSubmittedTemplateDetails(
    submittedTemplate: any,
    submitterInfo?: TemplateSubmitterInfo
): SubmittedTemplateDetails {
    return {
        _id: submittedTemplate._id,
        status: submittedTemplate.status,
        template_id: submittedTemplate.template_id,
        submitter_user_id: submittedTemplate.submitter_user_id,
        submitted_date: submittedTemplate.submitted_date,
        status_updated_date: submittedTemplate.status_updated_date,
        reject_reason: submittedTemplate.reject_reason,
        template_name: "Template Not Found",
        template_description: "Template data unavailable",
        owner: "Unknown",
        submitter_user_info: submitterInfo || { username: "", email: "" },
        pve_vmid: "",
        pve_node: "",
        default_cpu_cores: 0,
        default_memory_size: 0,
        default_disk_size: 0,
        cipassword: "",
        ciuser: ""
    };
}

export function buildSubmittedTemplateDetails(
    submittedTemplate: any,
    template: any,
    qemuConfig: PVE_qemu_config | null,
    ownerUsername?: string,
    submitterInfo?: TemplateSubmitterInfo
): SubmittedTemplateDetails {
    return {
        _id: submittedTemplate._id,
        status: submittedTemplate.status,
        template_id: submittedTemplate.template_id,
        submitter_user_id: submittedTemplate.submitter_user_id,
        submitted_date: submittedTemplate.submitted_date,
        status_updated_date: submittedTemplate.status_updated_date,
        reject_reason: submittedTemplate.reject_reason,
        template_name: qemuConfig?.name || template.description || "Unnamed Template",
        template_description: template.description,
        owner: ownerUsername || "Unknown User",
        submitter_user_info: submitterInfo || { username: "", email: "" },
        pve_vmid: template.pve_vmid,
        pve_node: template.pve_node,
        default_cpu_cores: qemuConfig ? PVEUtils.extractCpuCores(qemuConfig) : 0,
        default_memory_size: qemuConfig ? PVEUtils.extractMemorySize(qemuConfig) : 0,
        default_disk_size: qemuConfig ? (PVEUtils.extractDiskSizeFromConfig(qemuConfig.scsi0 || "") || 0) : 0,
        cipassword: template.cipassword || "",
        ciuser: template.ciuser || ""
    };
}
