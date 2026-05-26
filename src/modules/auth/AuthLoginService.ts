import bcrypt from "bcrypt";
import { Document } from "mongoose";
import { AuthResponse } from "../../interfaces/Response/AuthResponse";
import { User } from "../../interfaces/User";
import { WrongLoginAttempt } from "../../interfaces/WrongLoginAttempt";
import { logger } from "../../middlewares/log";
import { WrongLoginAttemptModel } from "../../orm/schemas/WrongLoginAttemptSchemas";
import { UsersModel } from "../../orm/schemas/UserSchemas";
import { generateToken, generateVerificationToken } from "../../utils/token";
import { sendVerificationEmail } from "../../utils/MailSender/VerificationTokenSender";
import { createResponse, resp } from "../../utils/resp";

type LoginUserDocument = Document & User & {
    save(): Promise<unknown>;
};

type WrongLoginAttemptDocument = WrongLoginAttempt & {
    save(): Promise<unknown>;
};

type AuthLoginServiceDeps = {
    userRepo?: {
        findByEmail(email: string): Promise<LoginUserDocument | null>;
    };
    wrongAttemptRepo?: {
        findByUserId(userId: unknown): Promise<WrongLoginAttemptDocument | null>;
        create(payload: WrongLoginAttempt): WrongLoginAttemptDocument;
        deleteByUserId(userId: unknown): Promise<unknown>;
    };
    comparePassword?: (password: string, hash: string) => Promise<boolean>;
    generateAuthToken?: (_id: string, role: User["role"], username: string) => string;
    generateEmailVerificationToken?: (_id: string) => string;
    sendVerificationEmail?: (email: string, token: string) => void;
    canSendEmail?: (lastTimeSent: Date | null | undefined, intervalMinutes: number) => boolean;
    now?: () => Date;
};

const defaultUserRepo = {
    findByEmail: (email: string) => UsersModel.findOne({ email }).exec() as Promise<LoginUserDocument | null>
};

const defaultWrongAttemptRepo = {
    findByUserId: (userId: unknown) => WrongLoginAttemptModel.findOne({ user_id: userId }).exec() as Promise<WrongLoginAttemptDocument | null>,
    create: (payload: WrongLoginAttempt) => new WrongLoginAttemptModel(payload) as WrongLoginAttemptDocument,
    deleteByUserId: (userId: unknown) => WrongLoginAttemptModel.deleteOne({ user_id: userId }).exec()
};

export class AuthLoginService {
    private readonly userRepo: NonNullable<AuthLoginServiceDeps["userRepo"]>;
    private readonly wrongAttemptRepo: NonNullable<AuthLoginServiceDeps["wrongAttemptRepo"]>;
    private readonly comparePassword: NonNullable<AuthLoginServiceDeps["comparePassword"]>;
    private readonly generateAuthToken: NonNullable<AuthLoginServiceDeps["generateAuthToken"]>;
    private readonly generateEmailVerificationToken: NonNullable<AuthLoginServiceDeps["generateEmailVerificationToken"]>;
    private readonly sendVerificationEmail: NonNullable<AuthLoginServiceDeps["sendVerificationEmail"]>;
    private readonly canSendEmail: NonNullable<AuthLoginServiceDeps["canSendEmail"]>;
    private readonly now: () => Date;

    constructor(deps: AuthLoginServiceDeps = {}) {
        this.userRepo = deps.userRepo ?? defaultUserRepo;
        this.wrongAttemptRepo = deps.wrongAttemptRepo ?? defaultWrongAttemptRepo;
        this.comparePassword = deps.comparePassword ?? bcrypt.compare;
        this.generateAuthToken = deps.generateAuthToken ?? generateToken;
        this.generateEmailVerificationToken = deps.generateEmailVerificationToken ?? generateVerificationToken;
        this.sendVerificationEmail = deps.sendVerificationEmail ?? sendVerificationEmail;
        this.canSendEmail = deps.canSendEmail ?? this.defaultCanSendEmail;
        this.now = deps.now ?? (() => new Date());
    }

    public async login(data: { email?: string; password?: string }): Promise<resp<AuthResponse | undefined>> {
        const { email, password } = data;
        if (!email || !password) {
            const missingFields = [];
            if (!email) missingFields.push("email");
            if (!password) missingFields.push("password");
            return createResponse(400, `missing required fields: ${missingFields.join(", ")}`);
        }

        const user = await this.userRepo.findByEmail(email);
        if (!user) {
            logger.warn(`someone tried to login with invalid email: ${email}`);
            return createResponse(400, "invalid email or password");
        }

        let wrongLoginAttempt = user.wrongLoginAttemptId
            ? await this.wrongAttemptRepo.findByUserId(user._id)
            : null;

        const lockResponse = this.getActiveLockResponse(wrongLoginAttempt);
        if (lockResponse) return lockResponse;

        if (!user.isVerified) {
            return this.handleUnverifiedLogin(user);
        }

        const isMatch = await this.comparePassword(password, user.password_hash);
        if (!isMatch) {
            await this.handleWrongLoginAttempt(user, 5, 10);
            wrongLoginAttempt = user.wrongLoginAttemptId
                ? await this.wrongAttemptRepo.findByUserId(user._id)
                : null;

            const newLockResponse = this.getActiveLockResponse(wrongLoginAttempt);
            if (newLockResponse) return newLockResponse;

            logger.warn(`someone tried to login with invalid password: ${email}`);
            return createResponse(400, "invalid email or password");
        }

        await this.clearExpiredOrSuccessfulWrongAttempts(user, wrongLoginAttempt);

        const token = this.generateAuthToken(user._id!.toString(), user.role, user.username);
        logger.info(`login successful for ${user.email}`);
        return createResponse(200, "login successful", { token } as AuthResponse);
    }

    public async handleWrongLoginAttempt(user: LoginUserDocument, intervalMinutes: number, maxWrongLoginAttemptCount: number): Promise<void> {
        const now = this.now();
        const intervalMs = intervalMinutes * 60 * 1000;
        let wrongLoginAttempt = user.wrongLoginAttemptId
            ? await this.wrongAttemptRepo.findByUserId(user._id)
            : null;

        if (!wrongLoginAttempt) {
            wrongLoginAttempt = this.wrongAttemptRepo.create({
                user_id: user._id!.toString(),
                wrongLoginAttemptStartTime: now,
                wrongLoginAttemptCount: 1,
                lockUntil: undefined,
            });
            await wrongLoginAttempt.save();
            user.wrongLoginAttemptId = wrongLoginAttempt._id;
            await user.save();
            return;
        }

        if (wrongLoginAttempt.lockUntil && wrongLoginAttempt.lockUntil > now) {
            return;
        }

        if (wrongLoginAttempt.lockUntil && wrongLoginAttempt.lockUntil <= now) {
            wrongLoginAttempt.lockUntil = undefined;
            wrongLoginAttempt.wrongLoginAttemptCount = 0;
            wrongLoginAttempt.wrongLoginAttemptStartTime = now;
        }

        if (!wrongLoginAttempt.wrongLoginAttemptStartTime || (now.getTime() - wrongLoginAttempt.wrongLoginAttemptStartTime.getTime()) > intervalMs) {
            wrongLoginAttempt.wrongLoginAttemptStartTime = now;
            wrongLoginAttempt.wrongLoginAttemptCount = 1;
        } else {
            wrongLoginAttempt.wrongLoginAttemptCount = (wrongLoginAttempt.wrongLoginAttemptCount ?? 0) + 1;
        }

        if ((wrongLoginAttempt.wrongLoginAttemptCount ?? 0) >= maxWrongLoginAttemptCount) {
            wrongLoginAttempt.lockUntil = new Date(now.getTime() + intervalMs);
            user.isLocked = true;
        }

        await wrongLoginAttempt.save();
        await user.save();
    }

    private async handleUnverifiedLogin(user: LoginUserDocument): Promise<resp<AuthResponse | undefined>> {
        if (this.canSendEmail(user.lastTimeVerifyEmailSent, 5)) {
            this.sendVerificationEmail(user.email, this.generateEmailVerificationToken(user._id!.toString()));
            user.lastTimeVerifyEmailSent = this.now();
            await user.save();
            logger.warn(`someone tried to login with unverified email: ${user.email}`);
            return createResponse(400, "email not verified, please verify your email");
        }

        const minutesLeft = user.lastTimeVerifyEmailSent
            ? Math.ceil((user.lastTimeVerifyEmailSent.getTime() + 5 * 60 * 1000 - this.now().getTime()) / 60000)
            : 5;
        logger.warn(`someone tried to login with unverified email: ${user.email}`);
        return createResponse(400, `please wait ${minutesLeft} minute(s) before resending the verification email`);
    }

    private async clearExpiredOrSuccessfulWrongAttempts(user: LoginUserDocument, wrongLoginAttempt: WrongLoginAttemptDocument | null): Promise<void> {
        if (!wrongLoginAttempt) return;

        user.isLocked = false;
        await this.wrongAttemptRepo.deleteByUserId(user._id);
        user.wrongLoginAttemptId = undefined;
        if (wrongLoginAttempt.lockUntil && wrongLoginAttempt.lockUntil <= this.now()) {
            logger.info(`user ${user.email} is unlocked`);
        }
        await user.save();
    }

    private getActiveLockResponse(wrongLoginAttempt: WrongLoginAttemptDocument | null): resp<AuthResponse | undefined> | null {
        if (!wrongLoginAttempt?.lockUntil || wrongLoginAttempt.lockUntil <= this.now()) return null;

        const minutesLeft = Math.ceil((wrongLoginAttempt.lockUntil.getTime() - this.now().getTime()) / 60000);
        return createResponse(400, `user is locked, please wait ${minutesLeft} minute(s) until the lock is lifted`);
    }

    private defaultCanSendEmail(lastTimeSent: Date | null | undefined, intervalMinutes: number): boolean {
        if (!lastTimeSent) return true;
        const diffMs = new Date().getTime() - lastTimeSent.getTime();
        return diffMs / (1000 * 60) >= intervalMinutes;
    }
}

export const authLoginService = new AuthLoginService();
