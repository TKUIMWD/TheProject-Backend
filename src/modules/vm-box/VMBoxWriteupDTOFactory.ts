import { DEFAULT_AVATAR } from "../../utils/avatarUpload";

type BoxWriteupUserSource = {
    author_user_id?: unknown;
    reviewed_by_user_id?: unknown;
};

type BoxWriteupBoxSource = {
    box_id?: unknown;
};

type RelatedEntitySource = {
    _id?: unknown;
};

export function buildBoxWriteupDTO(
    writeup: any,
    options: {
        author?: any | null;
        reviewer?: any | null;
        box?: any | null;
        template?: any | null;
        includePrivate?: boolean;
        canModify?: boolean;
        canReview?: boolean;
    } = {}
): any {
    const includePrivate = options.includePrivate === true;
    const canModify = options.canModify === true;

    return {
        _id: writeup._id?.toString(),
        box_id: writeup.box_id,
        title: writeup.title,
        content_md: writeup.content_md,
        status: writeup.status,
        is_public: writeup.is_public === true,
        submitted_date: writeup.submitted_date,
        updated_date: writeup.updated_date,
        reviewed_by_user_id: includePrivate ? writeup.reviewed_by_user_id : undefined,
        reviewed_date: writeup.reviewed_date,
        reject_reason: includePrivate || canModify ? writeup.reject_reason : undefined,
        author_info: buildAuthorInfo(options.author, includePrivate),
        reviewer_info: options.reviewer && includePrivate ? {
            username: options.reviewer.username,
            email: options.reviewer.email
        } : undefined,
        box_info: options.box ? {
            _id: options.box._id?.toString() || writeup.box_id,
            name: options.template?.description || options.box.box_setup_description,
            description: options.box.box_setup_description
        } : undefined,
        can_modify: canModify,
        can_review: options.canReview === true
    };
}

function buildAuthorInfo(author: any | null | undefined, includePrivate: boolean): { username: string; email?: string; avatar_path: string } {
    if (!author) {
        return {
            username: "Unknown User",
            avatar_path: DEFAULT_AVATAR
        };
    }

    return {
        username: author.username,
        email: includePrivate ? author.email : undefined,
        avatar_path: author.avatar_path || DEFAULT_AVATAR
    };
}

export function collectBoxWriteupUserIds(writeups: BoxWriteupUserSource[]): string[] {
    const ids: string[] = [];
    for (const writeup of writeups) {
        if (writeup.author_user_id !== undefined && writeup.author_user_id !== null) {
            ids.push(String(writeup.author_user_id));
        }
        if (writeup.reviewed_by_user_id !== undefined && writeup.reviewed_by_user_id !== null) {
            ids.push(String(writeup.reviewed_by_user_id));
        }
    }
    return Array.from(new Set(ids.filter((id) => id !== "")));
}

export function collectBoxWriteupBoxIds(writeups: BoxWriteupBoxSource[]): string[] {
    return Array.from(new Set(
        writeups
            .map((writeup) => writeup.box_id)
            .filter((id) => id !== undefined && id !== null)
            .map((id) => String(id))
            .filter((id) => id !== "")
    ));
}

export function buildBoxWriteupRelatedEntityMap<T extends RelatedEntitySource>(entities: T[]): Map<string, T> {
    const map = new Map<string, T>();
    for (const entity of entities) {
        if (entity._id === undefined || entity._id === null) continue;
        map.set(String(entity._id), entity);
    }
    return map;
}

export function getBoxWriteupRelatedEntity<T>(
    entityById: Map<string, T>,
    entityId: unknown
): T | undefined {
    if (entityId === undefined || entityId === null) {
        return undefined;
    }
    return entityById.get(String(entityId));
}
