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
    wrongLoginAttemptStartTime?: Date,
    wrongLoginAttemptCount?: number,
    isLocked?: boolean,
    lockUntil?: Date,
    registeredAt?: Date,
}