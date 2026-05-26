import { Service } from "../abstract/Service";
import { resp , createResponse } from "../utils/resp";
import { DBResp } from "../interfaces/Response/DBResp";
import { Document } from "mongoose";
import { generatePasswordResetToken } from "../utils/token";
import { AuthResponse } from "../interfaces/Response/AuthResponse";
import { logger } from "../middlewares/log";
import { Request } from "express";
import { UsersModel } from "../orm/schemas/UserSchemas";
import { sendForgotPasswordEmail } from "../utils/MailSender/ForgotPasswordSender";
import { generateHashedPassword, passwordStrengthCheck } from "../utils/password";
import { validateTokenAndGetUser, validatePasswordResetTokenAndGetUser } from "../utils/auth";
import { authLoginService } from "../modules/auth/AuthLoginService";
import { authRegistrationService } from "../modules/auth/AuthRegistrationService";


export class AuthService extends Service {
    public canSendEmail(lastTimeSent: Date | null | undefined, intervalMinutes: number): boolean {
        return authRegistrationService.canSendEmail(lastTimeSent, intervalMinutes);
    }

    public async register(data: { username: string, email: string, password: string }): Promise<resp<DBResp<Document> | undefined>> {
        try {
            return authRegistrationService.register(data);
        } catch (error) {
            logger.error(error);
            return createResponse(500, "internal server error");
        }
    }

    public async verify(Request: Request): Promise<resp<AuthResponse | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<AuthResponse>(Request);
            if (error) {
                return error;
            }

            if (user) {
                user.isVerified = true;
                await user.save();
                logger.info(`email verified successfully for ${user.email}`);
                return createResponse(200, "email verified successfully");
            }
            return createResponse(200, "email verified successfully");
        } catch (error) {
            logger.error(error);
            return createResponse(500, "internal server error");
        }
    }

    /*
    * @param data : {email:string,password:string}
    * @returns resp<AuthResponse | undefined>
    */
    public async login(data: { email: string, password: string }): Promise<resp<AuthResponse | undefined>> {
        try {
            return authLoginService.login(data);
        } catch (error) {
            logger.error(error);
            return createResponse(500, "internal server error");
        }
    }

    public async logout(Request: Request): Promise<resp<DBResp<Document> | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<DBResp<Document>>(Request);
            if (error) {
                return error;
            }

            if (user) {
                logger.info(`logout successful for ${user.username}`);
                return createResponse(200, "logout successful");
            }
            return createResponse(200, "logout successful");
        } catch (error) {
            logger.error(error);
            return createResponse(500, "internal server error");
        }
    }

    public async forgotPassword(Request: Request): Promise<resp<DBResp<Document> | undefined>> {
        if (Request.method === "POST") {
            try {
                const email = Request.body.email;
                if (!email) {
                    return createResponse(400, "missing email field");
                }
                
                const user = await UsersModel.findOne({ email });
                if (!user) {
                    return createResponse(200, "If the email exists, a password reset email has been sent");
                }
                
                if (this.canSendEmail(user.lastTimePasswordResetEmailSent, 5)) {
                    sendForgotPasswordEmail(email, generatePasswordResetToken(email));
                    user.lastTimePasswordResetEmailSent = new Date();
                    await user.save();
                    return createResponse(200, "password reset email sent");
                } else {
                    const minutesLeft = user.lastTimePasswordResetEmailSent
                        ? Math.ceil((user.lastTimePasswordResetEmailSent.getTime() + 5 * 60 * 1000 - new Date().getTime()) / 60000)
                        : 5;
                    return createResponse(400, `please wait ${minutesLeft} minute(s) before resending the verification email`);
                }
            } catch (error) {
                logger.error(error);
                return createResponse(500, "internal server error");
            }
        }
        else if (Request.method === "PUT") {
            try {
                const { user, error } = await validatePasswordResetTokenAndGetUser<DBResp<Document>>(Request);
                if (error) {
                    return error;
                }

                const newPassword = Request.body.password;
                if (!newPassword) {
                    return createResponse(400, "missing password field");
                }
                
                const passwordStrengthCheckResult = passwordStrengthCheck(newPassword);
                if (!passwordStrengthCheckResult.isValid) {
                    return createResponse(400, `password does not meet the requirements: ${passwordStrengthCheckResult.missingRequirements.join(", ")}`);
                }
                
                const hashedPassword = await generateHashedPassword(newPassword);
                user.password_hash = hashedPassword;
                await user.save();
                logger.info(`password reset successful for ${user.email}`);
                return createResponse(200, "password reset successful");
            }
            catch (error) {
                logger.error(error);
                return createResponse(500, "internal server error");
            }
        }
        else {
            return createResponse(400, "invalid method");
        }
    }
}
