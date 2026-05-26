import { Document } from "mongoose";
import { DBResp } from "../../interfaces/Response/DBResp";
import { User } from "../../interfaces/User";
import { logger } from "../../middlewares/log";
import { UsersModel } from "../../orm/schemas/UserSchemas";
import { sendForgotPasswordEmail } from "../../utils/MailSender/ForgotPasswordSender";
import { generateHashedPassword, passwordStrengthCheck } from "../../utils/password";
import { createResponse, resp } from "../../utils/resp";
import { generatePasswordResetToken, verifyToken } from "../../utils/token";

type ForgotPasswordUserDocument = Document & User & {
    save(): Promise<unknown>;
};

type ForgotPasswordInput = {
    method: string;
    body?: {
        email?: string;
        password?: string;
    };
    authorizationHeader?: string;
};

type AuthForgotPasswordServiceDeps = {
    userRepo?: {
        findByEmail(email: string): Promise<ForgotPasswordUserDocument | null>;
    };
    checkPasswordStrength?: (password: string) => { isValid: boolean; missingRequirements: string[] };
    hashPassword?: (password: string) => Promise<string>;
    generateResetToken?: (email: string) => string;
    verifyResetToken?: (token: string) => unknown;
    sendResetEmail?: (email: string, token: string) => void;
    now?: () => Date;
};

const defaultUserRepo = {
    findByEmail: (email: string) => UsersModel.findOne({ email }).exec() as Promise<ForgotPasswordUserDocument | null>
};

export class AuthForgotPasswordService {
    private readonly userRepo: NonNullable<AuthForgotPasswordServiceDeps["userRepo"]>;
    private readonly checkPasswordStrength: NonNullable<AuthForgotPasswordServiceDeps["checkPasswordStrength"]>;
    private readonly hashPassword: NonNullable<AuthForgotPasswordServiceDeps["hashPassword"]>;
    private readonly generateResetToken: NonNullable<AuthForgotPasswordServiceDeps["generateResetToken"]>;
    private readonly verifyResetToken: NonNullable<AuthForgotPasswordServiceDeps["verifyResetToken"]>;
    private readonly sendResetEmail: NonNullable<AuthForgotPasswordServiceDeps["sendResetEmail"]>;
    private readonly now: () => Date;

    constructor(deps: AuthForgotPasswordServiceDeps = {}) {
        this.userRepo = deps.userRepo ?? defaultUserRepo;
        this.checkPasswordStrength = deps.checkPasswordStrength ?? passwordStrengthCheck;
        this.hashPassword = deps.hashPassword ?? generateHashedPassword;
        this.generateResetToken = deps.generateResetToken ?? generatePasswordResetToken;
        this.verifyResetToken = deps.verifyResetToken ?? verifyToken;
        this.sendResetEmail = deps.sendResetEmail ?? sendForgotPasswordEmail;
        this.now = deps.now ?? (() => new Date());
    }

    public async handle(input: ForgotPasswordInput): Promise<resp<DBResp<Document> | undefined>> {
        try {
            if (input.method === "POST") {
                return this.sendPasswordResetEmail(input.body?.email);
            }

            if (input.method === "PUT") {
                return this.resetPassword(input.authorizationHeader, input.body?.password);
            }

            return createResponse(400, "invalid method");
        } catch (error) {
            logger.error(error);
            return createResponse(500, "internal server error");
        }
    }

    private async sendPasswordResetEmail(email: string | undefined): Promise<resp<DBResp<Document> | undefined>> {
        if (!email) {
            return createResponse(400, "missing email field");
        }

        const user = await this.userRepo.findByEmail(email);
        if (!user) {
            return createResponse(200, "If the email exists, a password reset email has been sent");
        }

        if (this.canSendEmail(user.lastTimePasswordResetEmailSent, 5)) {
            this.sendResetEmail(email, this.generateResetToken(email));
            user.lastTimePasswordResetEmailSent = this.now();
            await user.save();
            return createResponse(200, "password reset email sent");
        }

        const minutesLeft = user.lastTimePasswordResetEmailSent
            ? Math.ceil((user.lastTimePasswordResetEmailSent.getTime() + 5 * 60 * 1000 - this.now().getTime()) / 60000)
            : 5;
        return createResponse(400, `please wait ${minutesLeft} minute(s) before resending the verification email`);
    }

    private async resetPassword(
        authorizationHeader: string | undefined,
        newPassword: string | undefined
    ): Promise<resp<DBResp<Document> | undefined>> {
        const tokenResult = this.validateAuthorizationHeader(authorizationHeader);
        if (tokenResult.error) {
            return tokenResult.error;
        }

        const decoded = tokenResult.decoded as { email?: string };
        const user = decoded.email ? await this.userRepo.findByEmail(decoded.email) : null;
        if (!user) {
            return createResponse(400, "invalid token");
        }

        if (!newPassword) {
            return createResponse(400, "missing password field");
        }

        const passwordStrengthCheckResult = this.checkPasswordStrength(newPassword);
        if (!passwordStrengthCheckResult.isValid) {
            return createResponse(400, `password does not meet the requirements: ${passwordStrengthCheckResult.missingRequirements.join(", ")}`);
        }

        user.password_hash = await this.hashPassword(newPassword);
        await user.save();
        logger.info(`password reset successful for ${user.email}`);
        return createResponse(200, "password reset successful");
    }

    public canSendEmail(lastTimeSent: Date | null | undefined, intervalMinutes: number): boolean {
        if (!lastTimeSent) return true;
        const diffMs = this.now().getTime() - lastTimeSent.getTime();
        return diffMs / (1000 * 60) >= intervalMinutes;
    }

    private validateAuthorizationHeader(authorizationHeader: string | undefined): {
        decoded: unknown;
        error?: resp<DBResp<Document> | undefined>;
    } {
        if (!authorizationHeader) {
            return {
                decoded: null,
                error: createResponse(400, "missing authorization header")
            };
        }

        const token = authorizationHeader.split(" ")[1];
        if (!token) {
            return {
                decoded: null,
                error: createResponse(400, "missing token in authorization header")
            };
        }

        try {
            const decoded = this.verifyResetToken(token);
            if (!decoded) {
                return {
                    decoded: null,
                    error: createResponse(400, "invalid token")
                };
            }
            return { decoded };
        } catch (error) {
            return {
                decoded: null,
                error: createResponse(401, (error as Error).message || "invalid token")
            };
        }
    }
}

export const authForgotPasswordService = new AuthForgotPasswordService();
