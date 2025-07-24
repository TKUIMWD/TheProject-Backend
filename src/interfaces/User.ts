import Roles from "../enum/role";

export interface User{
    _id?: string,
    username: string,
    password_hash: string,
    email: string,
    isVerified: boolean,
    role: Roles,
    lastTimeVerifyEmailSent?: Date,
    lastTimePasswordResetEmailSent?: Date,
    isLocked?: boolean,
    registeredAt?: Date,
    avatar_path?: string,
    wrongLoginAttemptId?: string,
    compute_resource_plan_id: string,
    used_compute_resource_id: string,
    course_ids: Array<string>;
    owned_vms: Array<string>;
    owned_templates: Array<string>;
}

export interface UserProfile {
    username: string;
    email: string;
    avatar_path?: string;
}