import { SubmittedBoxStatus } from "../../interfaces/SubmittedBox";
import { VM_Box_Info } from "../../interfaces/VM/VM_Box";
import { resp, createResponse } from "../../utils/resp";
import { userRepository } from "../users/UserRepository";
import { vmTemplateRepository } from "../vm/VMTemplateRepository";
import {
    buildPendingBoxInfo,
    buildPublicBoxInfo,
    buildSubmittedBoxInfo,
    buildVMBoxPublishedBoxLookup,
    buildVMBoxSubmitterInfoMap,
    buildVMBoxTemplateMap,
    buildVMBoxWriteupCountMap,
    collectVMBoxIds,
    collectVMBoxSubmitterIds,
    collectVMBoxTemplateIds,
    getVMBoxPublishedBoxForSubmission,
    getVMBoxSubmitterInfo,
    getVMBoxTemplate,
    getVMBoxWriteupCount,
    VMBoxTemplateInfo
} from "./VMBoxListDTOFactory";
import { vmBoxRepository } from "./VMBoxRepository";
import { vmBoxSubmissionRepository } from "./VMBoxSubmissionRepository";
import { vmBoxWriteupRepository } from "./VMBoxWriteupRepository";

type VMBoxSubmissionRepositoryPort = {
    listAllNewestFirst(): Promise<any[]>;
    listByStatus(status: SubmittedBoxStatus): Promise<any[]>;
};

type VMBoxRepositoryPort = {
    listPublicBoxes(): Promise<any[]>;
    listPublishedForSubmissions(submissions: any[]): Promise<any[]>;
};

type VMTemplateRepositoryPort = {
    listByIds(templateIds: string[]): Promise<any[]>;
};

type UserRepositoryPort = {
    listByIds(userIds: string[], options?: { lean?: boolean }): Promise<any[]>;
};

type VMBoxWriteupRepositoryPort = {
    listPublicWriteupCounts(boxIds: string[]): Promise<any[]>;
};

export type VMBoxTemplateInfoResolver = (
    template: any | undefined,
    fallbackDescription: string,
    options?: { useTemplateOwnerOnError?: boolean }
) => Promise<VMBoxTemplateInfo>;

export type VMBoxListServiceDeps = {
    submissions?: VMBoxSubmissionRepositoryPort;
    boxes?: VMBoxRepositoryPort;
    templates?: VMTemplateRepositoryPort;
    users?: UserRepositoryPort;
    writeups?: VMBoxWriteupRepositoryPort;
    resolveTemplateInfo: VMBoxTemplateInfoResolver;
};

export class VMBoxListService {
    private readonly submissions: VMBoxSubmissionRepositoryPort;
    private readonly boxes: VMBoxRepositoryPort;
    private readonly templates: VMTemplateRepositoryPort;
    private readonly users: UserRepositoryPort;
    private readonly writeups: VMBoxWriteupRepositoryPort;
    private readonly resolveTemplateInfo: VMBoxTemplateInfoResolver;

    constructor(deps: VMBoxListServiceDeps) {
        this.submissions = deps.submissions ?? vmBoxSubmissionRepository;
        this.boxes = deps.boxes ?? vmBoxRepository;
        this.templates = deps.templates ?? vmTemplateRepository;
        this.users = deps.users ?? userRepository;
        this.writeups = deps.writeups ?? vmBoxWriteupRepository;
        this.resolveTemplateInfo = deps.resolveTemplateInfo;
    }

    public async listSubmittedBoxes(): Promise<resp<(VM_Box_Info & { status: SubmittedBoxStatus })[] | undefined>> {
        const submissions = await this.submissions.listAllNewestFirst();
        if (submissions.length === 0) {
            return createResponse(200, "No submitted boxes found", []);
        }

        const submitterInfoById = buildVMBoxSubmitterInfoMap(
            await this.users.listByIds(collectVMBoxSubmitterIds(submissions), { lean: true })
        );
        const templateById = buildVMBoxTemplateMap(
            await this.templates.listByIds(collectVMBoxTemplateIds(submissions))
        );
        const approvedSubmissions = submissions.filter((submission) => submission.status === SubmittedBoxStatus.approved);
        const publishedBoxLookup = buildVMBoxPublishedBoxLookup(
            await this.boxes.listPublishedForSubmissions(approvedSubmissions)
        );

        const boxInfos = await Promise.all(submissions.map(async (submission): Promise<VM_Box_Info & { status: SubmittedBoxStatus }> => {
            const template = getVMBoxTemplate(templateById, submission.vmtemplate_id);
            const templateInfo = await this.resolveTemplateInfo(template, submission.box_setup_description, {
                useTemplateOwnerOnError: true
            });
            const publishedBox = submission.status === SubmittedBoxStatus.approved
                ? getVMBoxPublishedBoxForSubmission(publishedBoxLookup, submission)
                : null;
            const submitterInfo = getVMBoxSubmitterInfo(submitterInfoById, submission.submitter_user_id);
            return buildSubmittedBoxInfo(submission, templateInfo, publishedBox, submitterInfo);
        }));

        return createResponse(200, "Submitted boxes fetched successfully", boxInfos);
    }

    public async listPublicBoxes(): Promise<resp<VM_Box_Info[] | undefined>> {
        const boxes = await this.boxes.listPublicBoxes();
        if (boxes.length === 0) {
            return createResponse(200, "No public boxes found", []);
        }

        const submitterInfoById = buildVMBoxSubmitterInfoMap(
            await this.users.listByIds(collectVMBoxSubmitterIds(boxes), { lean: true })
        );
        const templateById = buildVMBoxTemplateMap(
            await this.templates.listByIds(collectVMBoxTemplateIds(boxes))
        );
        const publicWriteupCountByBoxId = buildVMBoxWriteupCountMap(
            await this.writeups.listPublicWriteupCounts(collectVMBoxIds(boxes))
        );

        const boxInfos = await Promise.all(boxes.map(async (box): Promise<VM_Box_Info> => {
            const template = getVMBoxTemplate(templateById, box.vmtemplate_id);
            const templateInfo = await this.resolveTemplateInfo(template, box.box_setup_description);
            const submitterInfo = getVMBoxSubmitterInfo(submitterInfoById, box.submitter_user_id);

            return buildPublicBoxInfo(box, templateInfo, {
                templateOwner: template?.owner,
                publicWriteupCount: getVMBoxWriteupCount(publicWriteupCountByBoxId, box._id),
                submitterInfo
            });
        }));

        return createResponse(200, "Public boxes fetched successfully", boxInfos);
    }

    public async listPendingBoxes(): Promise<resp<VM_Box_Info[] | undefined>> {
        const boxes = await this.submissions.listByStatus(SubmittedBoxStatus.not_approved);
        if (boxes.length === 0) {
            return createResponse(200, "No pending boxes found", []);
        }

        const submitterInfoById = buildVMBoxSubmitterInfoMap(
            await this.users.listByIds(collectVMBoxSubmitterIds(boxes), { lean: true })
        );
        const templateById = buildVMBoxTemplateMap(
            await this.templates.listByIds(collectVMBoxTemplateIds(boxes))
        );

        const boxInfos = await Promise.all(boxes.map(async (box): Promise<VM_Box_Info> => {
            const template = getVMBoxTemplate(templateById, box.vmtemplate_id);
            const templateInfo = await this.resolveTemplateInfo(template, box.box_setup_description, {
                useTemplateOwnerOnError: true
            });
            const submitterInfo = getVMBoxSubmitterInfo(submitterInfoById, box.submitter_user_id);
            return buildPendingBoxInfo(box, templateInfo, submitterInfo);
        }));

        return createResponse(200, "Pending boxes fetched successfully", boxInfos);
    }
}
