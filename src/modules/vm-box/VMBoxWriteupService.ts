import Roles from "../../enum/role";
import { BoxWriteupStatus } from "../../interfaces/BoxWriteup";
import { resp, createResponse } from "../../utils/resp";
import { userRepository } from "../users/UserRepository";
import { vmTemplateRepository } from "../vm/VMTemplateRepository";
import {
    buildVMBoxTemplateMap,
    collectVMBoxTemplateIds,
    getVMBoxTemplate
} from "./VMBoxListDTOFactory";
import {
    buildBoxWriteupDTO,
    buildBoxWriteupRelatedEntityMap,
    collectBoxWriteupBoxIds,
    collectBoxWriteupUserIds,
    getBoxWriteupRelatedEntity
} from "./VMBoxWriteupDTOFactory";
import {
    canModerateVMBox,
    canModifyBoxWriteup
} from "./VMBoxPermissionPolicy";
import {
    validateBoxWriteupReview,
    validateBoxWriteupSubmission,
    validateBoxWriteupSubmissionsQuery,
    validateBoxWriteupVisibility,
    validateMyBoxWriteupsQuery,
    validatePublicBoxWriteupsQuery
} from "./VMBoxWriteupPolicy";
import { vmBoxRepository } from "./VMBoxRepository";
import { vmBoxWriteupRepository } from "./VMBoxWriteupRepository";

type VMBoxRepositoryPort = {
    findById(boxId: string): Promise<any | null>;
    listByIds(boxIds: string[]): Promise<any[]>;
    listOwnedBoxIds(submitterUserId: string): Promise<string[]>;
};

type VMBoxWriteupRepositoryPort = {
    createWriteupDocument(payload: unknown): any;
    findActiveByAuthorAndBox(boxId: string, authorUserId: string): Promise<any | null>;
    listPublicApprovedByBox(boxId: string): Promise<any[]>;
    listNewestByFilter(filter: unknown): Promise<any[]>;
    findById(writeupId: string): Promise<any | null>;
};

type UserRepositoryPort = {
    listByIds(userIds: string[], options?: unknown): Promise<any[]>;
};

type VMTemplateRepositoryPort = {
    listByIds(templateIds: string[]): Promise<any[]>;
};

export type VMBoxWriteupServiceDeps = {
    boxes?: VMBoxRepositoryPort;
    writeups?: VMBoxWriteupRepositoryPort;
    users?: UserRepositoryPort;
    templates?: VMTemplateRepositoryPort;
};

export class VMBoxWriteupService {
    private readonly boxes: VMBoxRepositoryPort;
    private readonly writeups: VMBoxWriteupRepositoryPort;
    private readonly users: UserRepositoryPort;
    private readonly templates: VMTemplateRepositoryPort;

    constructor(deps: VMBoxWriteupServiceDeps = {}) {
        this.boxes = deps.boxes ?? vmBoxRepository;
        this.writeups = deps.writeups ?? vmBoxWriteupRepository;
        this.users = deps.users ?? userRepository;
        this.templates = deps.templates ?? vmTemplateRepository;
    }

    public async submitWriteup(input: {
        user: any;
        request: { box_id?: unknown; title?: unknown; content_md?: unknown };
    }): Promise<resp<any>> {
        const submissionPolicy = validateBoxWriteupSubmission(input.request);
        if (!submissionPolicy.valid) {
            return createResponse(400, submissionPolicy.message);
        }

        const box = await this.boxes.findById(submissionPolicy.boxId);
        if (!box || !box.is_public) {
            return createResponse(404, "Public box not found");
        }

        const authorUserId = input.user._id.toString();
        const activeExisting = await this.writeups.findActiveByAuthorAndBox(
            submissionPolicy.boxId,
            authorUserId
        );
        if (activeExisting) {
            return createResponse(400, "You already have a pending or approved writeup for this box");
        }

        const writeup = this.writeups.createWriteupDocument({
            box_id: submissionPolicy.boxId,
            author_user_id: authorUserId,
            title: submissionPolicy.title,
            content_md: submissionPolicy.contentMd,
            status: BoxWriteupStatus.pending,
            is_public: false,
            submitted_date: new Date(),
            updated_date: new Date()
        });
        await writeup.save();

        return createResponse(200, "Box writeup submitted for review", {
            writeup: await this.toWriteupDTO(writeup, { viewer: input.user, includePrivate: true })
        });
    }

    public async listPublicWriteups(input: {
        request: { box_id?: unknown };
    }): Promise<resp<any>> {
        const queryPolicy = validatePublicBoxWriteupsQuery(input.request);
        if (!queryPolicy.valid) {
            return createResponse(400, queryPolicy.message);
        }

        const box = await this.boxes.findById(queryPolicy.boxId);
        if (!box || !box.is_public) {
            return createResponse(404, "Public box not found");
        }

        const writeups = await this.writeups.listPublicApprovedByBox(queryPolicy.boxId);
        const dto = await this.toWriteupDTOs(writeups);
        return createResponse(200, "Public box writeups fetched successfully", {
            box_id: queryPolicy.boxId,
            writeups: dto,
            total_writeups: dto.length
        });
    }

    public async listMyWriteups(input: {
        user: any;
        request: { box_id?: unknown };
    }): Promise<resp<any>> {
        const queryPolicy = validateMyBoxWriteupsQuery(input.request);
        if (!queryPolicy.valid) {
            return createResponse(400, queryPolicy.message);
        }

        const filter: any = { author_user_id: input.user._id.toString() };
        if (queryPolicy.boxId !== undefined) {
            filter.box_id = queryPolicy.boxId;
        }

        const writeups = await this.writeups.listNewestByFilter(filter);
        const dto = await this.toWriteupDTOs(writeups, { viewer: input.user });
        return createResponse(200, "My box writeups fetched successfully", {
            writeups: dto,
            total_writeups: dto.length
        });
    }

    public async listSubmissionWriteups(input: {
        user: any;
        request: { box_id?: unknown; status?: unknown };
    }): Promise<resp<any>> {
        const queryPolicy = validateBoxWriteupSubmissionsQuery(input.request);
        if (!queryPolicy.valid) {
            return createResponse(400, queryPolicy.message);
        }
        const filter: any = {};

        if (queryPolicy.status !== undefined) {
            filter.status = queryPolicy.status;
        }

        if (queryPolicy.boxId !== undefined) {
            const box = await this.boxes.findById(queryPolicy.boxId);
            if (!box) return createResponse(404, "Box not found");
            if (!this.canModerateBox(input.user, box)) {
                return createResponse(403, "You do not have permission to manage writeups for this box");
            }
            filter.box_id = queryPolicy.boxId;
        } else if (input.user.role !== Roles.SuperAdmin) {
            filter.box_id = { $in: await this.boxes.listOwnedBoxIds(input.user._id.toString()) };
        }

        const writeups = await this.writeups.listNewestByFilter(filter);
        const dto = await this.toWriteupDTOs(writeups, { viewer: input.user, includePrivate: true });
        return createResponse(200, "Box writeup submissions fetched successfully", {
            writeups: dto,
            total_writeups: dto.length
        });
    }

    public async reviewWriteup(input: {
        user: any;
        request: { writeup_id?: unknown; status?: unknown; reject_reason?: unknown; is_public?: unknown };
    }): Promise<resp<any>> {
        const reviewPolicy = validateBoxWriteupReview(input.request);
        if (!reviewPolicy.valid) {
            return createResponse(400, reviewPolicy.message);
        }

        const writeup = await this.writeups.findById(reviewPolicy.writeupId);
        if (!writeup) return createResponse(404, "Writeup not found");

        const box = await this.boxes.findById(writeup.box_id);
        if (!box) return createResponse(404, "Box not found");
        if (!this.canModerateBox(input.user, box)) {
            return createResponse(403, "You do not have permission to review this writeup");
        }

        writeup.status = reviewPolicy.status;
        writeup.reviewed_by_user_id = input.user._id.toString();
        writeup.reviewed_date = new Date();
        writeup.updated_date = new Date();

        if (reviewPolicy.status === BoxWriteupStatus.approved) {
            writeup.reject_reason = undefined;
            writeup.is_public = reviewPolicy.isPublic === true;
        } else {
            writeup.reject_reason = reviewPolicy.rejectReason || "No reason provided";
            writeup.is_public = false;
        }

        await writeup.save();
        return createResponse(200, "Box writeup reviewed successfully", {
            writeup: await this.toWriteupDTO(writeup, { viewer: input.user, includePrivate: true })
        });
    }

    public async updateVisibility(input: {
        user: any;
        request: { writeup_id?: unknown; is_public?: unknown };
    }): Promise<resp<any>> {
        const visibilityPolicy = validateBoxWriteupVisibility(input.request);
        if (!visibilityPolicy.valid) {
            return createResponse(400, visibilityPolicy.message);
        }

        const writeup = await this.writeups.findById(visibilityPolicy.writeupId);
        if (!writeup) return createResponse(404, "Writeup not found");
        if (writeup.status !== BoxWriteupStatus.approved) {
            return createResponse(400, "Only approved writeups can be published");
        }

        const box = await this.boxes.findById(writeup.box_id);
        if (!box) return createResponse(404, "Box not found");
        if (!this.canModerateBox(input.user, box)) {
            return createResponse(403, "You do not have permission to manage this writeup");
        }

        writeup.is_public = visibilityPolicy.isPublic;
        writeup.updated_date = new Date();
        await writeup.save();

        return createResponse(200, "Box writeup visibility updated", {
            writeup: await this.toWriteupDTO(writeup, { viewer: input.user, includePrivate: true })
        });
    }

    private async toWriteupDTOs(writeups: any[], options: { viewer?: any; includePrivate?: boolean } = {}): Promise<any[]> {
        if (writeups.length === 0) return [];

        const userById = buildBoxWriteupRelatedEntityMap(
            await this.users.listByIds(collectBoxWriteupUserIds(writeups))
        );
        const boxById = buildBoxWriteupRelatedEntityMap(
            await this.boxes.listByIds(collectBoxWriteupBoxIds(writeups))
        );
        const boxes = Array.from(boxById.values());
        const templateById = buildVMBoxTemplateMap(
            await this.templates.listByIds(collectVMBoxTemplateIds(boxes))
        );

        return writeups.map((writeup) => {
            const author = getBoxWriteupRelatedEntity(userById, writeup.author_user_id);
            const reviewer = getBoxWriteupRelatedEntity(userById, writeup.reviewed_by_user_id);
            const box = getBoxWriteupRelatedEntity(boxById, writeup.box_id);
            const template = box ? getVMBoxTemplate(templateById, box.vmtemplate_id) : undefined;
            const canReview = Boolean(options.viewer && box && this.canModerateBox(options.viewer, box));
            const canModify = Boolean(options.viewer && canModifyBoxWriteup(options.viewer._id?.toString(), writeup.author_user_id?.toString()));

            return buildBoxWriteupDTO(writeup, {
                author,
                reviewer,
                box,
                template,
                includePrivate: options.includePrivate,
                canModify,
                canReview
            });
        });
    }

    private async toWriteupDTO(writeup: any, options: { viewer?: any; includePrivate?: boolean } = {}): Promise<any> {
        const [dto] = await this.toWriteupDTOs([writeup], options);
        return dto;
    }

    private canModerateBox(user: any, box: any): boolean {
        if (!user || !box) return false;
        return canModerateVMBox(user.role, user._id?.toString(), box.submitter_user_id?.toString());
    }
}

export const vmBoxWriteupService = new VMBoxWriteupService();
