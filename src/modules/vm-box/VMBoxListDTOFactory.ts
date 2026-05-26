import { SubmittedBoxStatus } from "../../interfaces/SubmittedBox";
import { VM_Box_Info } from "../../interfaces/VM/VM_Box";
import { PVEUtils } from "../../utils/PVEUtils";
import { normalizeFlagAnswers } from "./VMBoxSubmissionCreatePolicy";

export interface VMBoxTemplateInfo {
    name: string;
    description: string;
    default_cpu_cores: number;
    default_memory_size: number;
    default_disk_size: number;
    owner?: string;
}

export interface SubmitterInfo {
    username: string;
    email: string;
}

type VMBoxSubmitterSource = {
    submitter_user_id?: unknown;
};

type VMBoxTemplateSource = {
    vmtemplate_id?: unknown;
};

type VMBoxIdSource = {
    _id?: unknown;
};

type VMBoxSubmitterUserSource = {
    _id?: unknown;
    username?: unknown;
    email?: unknown;
};

type VMBoxTemplateSourceDocument = {
    _id?: unknown;
    description?: unknown;
    owner?: unknown;
};

type VMBoxWriteupCountSource = {
    _id?: unknown;
    count?: unknown;
};

type VMBoxPublishedBoxSource = {
    submitted_box_id?: unknown;
    vmtemplate_id?: unknown;
    submitter_user_id?: unknown;
    submitted_date?: unknown;
    is_public?: unknown;
};

export type VMBoxPublishedBoxLookup<T> = {
    bySubmissionId: Map<string, T>;
    byLegacyKey: Map<string, T>;
};

export function buildDefaultVMBoxTemplateInfo(description: string, owner = "Unknown"): VMBoxTemplateInfo {
    return {
        name: "Unknown Template",
        description,
        default_cpu_cores: 2,
        default_memory_size: 2048,
        default_disk_size: 20,
        owner
    };
}

export function buildVMBoxTemplateInfoFromQemuConfig(
    template: VMBoxTemplateSourceDocument,
    qemuConfig: any,
    fallbackDescription: string
): VMBoxTemplateInfo {
    const templateDescription = typeof template.description === "string"
        ? template.description
        : fallbackDescription;
    const owner = typeof template.owner === "string" ? template.owner : "Unknown";

    return {
        name: qemuConfig?.name || templateDescription,
        description: templateDescription,
        default_cpu_cores: PVEUtils.extractCpuCores(qemuConfig),
        default_memory_size: PVEUtils.extractMemorySize(qemuConfig),
        default_disk_size: PVEUtils.extractDiskSize(qemuConfig),
        owner
    };
}

export function buildSubmittedBoxInfo(
    submission: any,
    templateInfo: VMBoxTemplateInfo,
    publishedBox?: any | null,
    submitterInfo?: SubmitterInfo
): VM_Box_Info & { status: SubmittedBoxStatus } {
    return withSubmitterInfo({
        _id: submission._id,
        submitted_box_id: submission._id?.toString(),
        published_box_id: publishedBox?._id?.toString(),
        name: templateInfo.name,
        description: templateInfo.description,
        submitted_date: submission.submitted_date,
        owner: templateInfo.owner || "Unknown",
        default_cpu_cores: templateInfo.default_cpu_cores,
        default_memory_size: templateInfo.default_memory_size,
        default_disk_size: templateInfo.default_disk_size,
        is_public: submission.status === SubmittedBoxStatus.approved,
        box_setup_description: submission.box_setup_description,
        rating_score: publishedBox?.rating_score,
        review_count: publishedBox?.review_count,
        updated_date: publishedBox?.updated_date || submission.status_updated_date || submission.submitted_date,
        status: submission.status,
        reject_reason: submission.reject_reason,
        flag_answers: normalizeFlagAnswers(submission.flag_answers),
        allow_ai_assistant: publishedBox ? publishedBox.allow_ai_assistant !== false : submission.allow_ai_assistant !== false,
        design_md: submission.design_md,
        setup_md: submission.setup_md,
        writeup_md: submission.writeup_md
    }, submitterInfo);
}

export function buildPublicBoxInfo(
    box: any,
    templateInfo: VMBoxTemplateInfo,
    options: { templateOwner?: string; publicWriteupCount?: number; submitterInfo?: SubmitterInfo } = {}
): VM_Box_Info {
    return withSubmitterInfo({
        _id: box._id,
        name: templateInfo.name,
        description: templateInfo.description,
        submitted_date: box.submitted_date,
        owner: options.templateOwner || templateInfo.owner || "Unknown",
        default_cpu_cores: templateInfo.default_cpu_cores,
        default_memory_size: templateInfo.default_memory_size,
        default_disk_size: templateInfo.default_disk_size,
        is_public: box.is_public,
        rating_score: box.rating_score,
        review_count: box.review_count,
        updated_date: box.updated_date,
        update_log: box.update_log,
        flag_count: Object.keys(normalizeFlagAnswers(box.flag_answers)).length,
        allow_ai_assistant: box.allow_ai_assistant !== false,
        submitted_box_id: box.submitted_box_id,
        public_writeup_count: options.publicWriteupCount
    }, options.submitterInfo);
}

export function buildPendingBoxInfo(
    submission: any,
    templateInfo: VMBoxTemplateInfo,
    submitterInfo?: SubmitterInfo
): VM_Box_Info {
    return withSubmitterInfo({
        _id: submission._id,
        name: templateInfo.name,
        description: templateInfo.description,
        submitted_date: submission.submitted_date,
        owner: templateInfo.owner || "Unknown",
        default_cpu_cores: templateInfo.default_cpu_cores,
        default_memory_size: templateInfo.default_memory_size,
        default_disk_size: templateInfo.default_disk_size,
        is_public: false,
        box_setup_description: submission.box_setup_description,
        rating_score: undefined,
        review_count: undefined,
        updated_date: submission.status_updated_date || submission.submitted_date,
        allow_ai_assistant: submission.allow_ai_assistant !== false,
        design_md: submission.design_md,
        setup_md: submission.setup_md,
        writeup_md: submission.writeup_md
    }, submitterInfo);
}

function withSubmitterInfo<T extends VM_Box_Info>(info: T, submitterInfo?: SubmitterInfo): T {
    if (submitterInfo) {
        info.submitter_user_info = submitterInfo;
    }
    return info;
}

export function collectVMBoxSubmitterIds(items: VMBoxSubmitterSource[]): string[] {
    return Array.from(new Set(
        items
            .map((item) => item.submitter_user_id)
            .filter((id) => id !== undefined && id !== null)
            .map((id) => String(id))
            .filter((id) => id !== "")
    ));
}

export function buildVMBoxSubmitterInfoMap(users: VMBoxSubmitterUserSource[]): Map<string, SubmitterInfo> {
    const map = new Map<string, SubmitterInfo>();
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

export function getVMBoxSubmitterInfo(
    submitterInfoById: Map<string, SubmitterInfo>,
    submitterUserId: unknown
): SubmitterInfo | undefined {
    if (submitterUserId === undefined || submitterUserId === null) {
        return undefined;
    }
    return submitterInfoById.get(String(submitterUserId));
}

export function collectVMBoxTemplateIds(items: VMBoxTemplateSource[]): string[] {
    return Array.from(new Set(
        items
            .map((item) => item.vmtemplate_id)
            .filter((id) => id !== undefined && id !== null)
            .map((id) => String(id))
            .filter((id) => id !== "")
    ));
}

export function buildVMBoxTemplateMap<T extends VMBoxTemplateSourceDocument>(templates: T[]): Map<string, T> {
    const map = new Map<string, T>();
    templates.forEach((template) => {
        if (template._id === undefined || template._id === null) {
            return;
        }
        map.set(String(template._id), template);
    });
    return map;
}

export function getVMBoxTemplate<T>(
    templateById: Map<string, T>,
    templateId: unknown
): T | undefined {
    if (templateId === undefined || templateId === null) {
        return undefined;
    }
    return templateById.get(String(templateId));
}

export function collectVMBoxIds(items: VMBoxIdSource[]): string[] {
    return Array.from(new Set(
        items
            .map((item) => item._id)
            .filter((id) => id !== undefined && id !== null)
            .map((id) => String(id))
            .filter((id) => id !== "")
    ));
}

export function buildVMBoxWriteupCountMap(counts: VMBoxWriteupCountSource[]): Map<string, number> {
    const map = new Map<string, number>();
    counts.forEach((entry) => {
        if (entry._id === undefined || entry._id === null || typeof entry.count !== "number") {
            return;
        }
        map.set(String(entry._id), entry.count);
    });
    return map;
}

export function getVMBoxWriteupCount(
    countByBoxId: Map<string, number>,
    boxId: unknown
): number {
    if (boxId === undefined || boxId === null) {
        return 0;
    }
    return countByBoxId.get(String(boxId)) ?? 0;
}

export function buildVMBoxPublishedBoxLookup<T extends VMBoxPublishedBoxSource>(
    boxes: T[]
): VMBoxPublishedBoxLookup<T> {
    const bySubmissionId = new Map<string, T>();
    const byLegacyKey = new Map<string, T>();

    boxes.forEach((box) => {
        const submissionId = normalizeNonEmptyString(box.submitted_box_id);
        if (submissionId) {
            bySubmissionId.set(submissionId, box);
        }

        if (box.is_public !== true) {
            return;
        }

        const legacyKey = buildVMBoxPublishedBoxLegacyKey(box);
        if (legacyKey) {
            byLegacyKey.set(legacyKey, box);
        }
    });

    return { bySubmissionId, byLegacyKey };
}

export function getVMBoxPublishedBoxForSubmission<T>(
    lookup: VMBoxPublishedBoxLookup<T>,
    submission: VMBoxIdSource & VMBoxPublishedBoxSource
): T | undefined {
    const submissionId = normalizeNonEmptyString(submission._id);
    if (submissionId) {
        const linkedBox = lookup.bySubmissionId.get(submissionId);
        if (linkedBox) return linkedBox;
    }

    const legacyKey = buildVMBoxPublishedBoxLegacyKey(submission);
    return legacyKey ? lookup.byLegacyKey.get(legacyKey) : undefined;
}

function buildVMBoxPublishedBoxLegacyKey(source: VMBoxPublishedBoxSource): string | null {
    const templateId = normalizeNonEmptyString(source.vmtemplate_id);
    const submitterId = normalizeNonEmptyString(source.submitter_user_id);
    const submittedDate = normalizeDateKey(source.submitted_date);
    if (!templateId || !submitterId || !submittedDate) {
        return null;
    }
    return `${templateId}\u0000${submitterId}\u0000${submittedDate}`;
}

function normalizeNonEmptyString(value: unknown): string | null {
    if (value === undefined || value === null) {
        return null;
    }
    const normalized = String(value);
    return normalized === "" ? null : normalized;
}

function normalizeDateKey(value: unknown): string | null {
    if (value === undefined || value === null) {
        return null;
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    return String(value);
}
