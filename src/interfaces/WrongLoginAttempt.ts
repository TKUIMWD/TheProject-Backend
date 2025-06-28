export interface WrongLoginAttempt {
    _id: string;
    wrongLoginAttemptStartTime?: Date;
    wrongLoginAttemptCount?: number;
    lockUntil?: Date;
}
