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
}

export interface UserProfile {
    username: string;
    email: string;
    avatar_path?: string;
}