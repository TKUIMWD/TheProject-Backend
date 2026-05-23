export enum BoxWriteupStatus {
    pending = 'pending',
    approved = 'approved',
    rejected = 'rejected'
}

export interface BoxWriteup {
    _id?: string;
    box_id: string;
    author_user_id: string;
    title: string;
    content_md: string;
    status: BoxWriteupStatus;
    is_public: boolean;
    submitted_date: Date;
    updated_date: Date;
    reviewed_by_user_id?: string;
    reviewed_date?: Date;
    reject_reason?: string;
}

export interface BoxWriteupDTO extends BoxWriteup {
    author_info?: {
        username: string;
        email?: string;
        avatar_path?: string;
    };
    reviewer_info?: {
        username: string;
        email?: string;
    };
    box_info?: {
        _id: string;
        name: string;
        description: string;
    };
    can_modify?: boolean;
    can_review?: boolean;
}
