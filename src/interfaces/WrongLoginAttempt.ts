export interface WrongLoginAttempt {
    _id?: string;
    user_id: string;
    wrongLoginAttemptStartTime?: Date;
    wrongLoginAttemptCount?: number;
    lockUntil?: Date;
}
