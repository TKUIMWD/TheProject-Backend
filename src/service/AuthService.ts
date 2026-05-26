import { Service } from "../abstract/Service";
import { resp , createResponse } from "../utils/resp";
import { DBResp } from "../interfaces/Response/DBResp";
import { Document } from "mongoose";
import { generatePasswordResetToken, generateVerificationToken } from "../utils/token";
import { AuthResponse } from "../interfaces/Response/AuthResponse";
import { logger } from "../middlewares/log";
import { Request, Response } from "express";
import { UsersModel } from "../orm/schemas/UserSchemas";
import { sendVerificationEmail } from "../utils/MailSender/VerificationTokenSender";
import { sendForgotPasswordEmail } from "../utils/MailSender/ForgotPasswordSender";
import { generateHashedPassword, passwordStrengthCheck } from "../utils/password";
import { validateTokenAndGetUser, validatePasswordResetTokenAndGetUser } from "../utils/auth";
import { ComputeResourcePlanModel } from "../orm/schemas/ComputeResourcePlanSchemas";
import {
    classifyRegistrationConflict,
    collectMissingRegistrationFields
} from "../modules/auth/AuthRegistrationPolicy";
import { authLoginService } from "../modules/auth/AuthLoginService";


export class AuthService extends Service {
    /**
     * Checks if enough time has passed since the last email was sent.
     * @param lastTimeSent - The Date when the last email was sent (can be null/undefined if never sent).
     * @param intervalMinutes - The minimum interval in minutes required between emails.
     * @returns true if an email can be sent, false otherwise.
     */
    public canSendEmail(lastTimeSent: Date | null | undefined, intervalMinutes: number): boolean {
        if (!lastTimeSent) return true;
        const now = new Date();
        const diffMs = now.getTime() - lastTimeSent.getTime();
        const diffMinutes = diffMs / (1000 * 60);
        return diffMinutes >= intervalMinutes;
    }

    /*
    * @param data : {username:string,email:string,password:string}
    * @returns resp<DBResp<Document> | undefined>
    */
    public async register(data: { username: string, email: string, password: string }): Promise<resp<DBResp<Document> | undefined>> {
        try {
            const { username, email, password } = data;
            const missingFields = collectMissingRegistrationFields(data);
            if (missingFields.length > 0) {
                return createResponse(400, `missing required fields: ${missingFields.join(", ")}`);
            }

            // check if username or email already exists
            const existingUsers = await UsersModel.find({
                $or: [
                    { username },
                    { email }
                ]
            }).lean().exec();
            const conflict = classifyRegistrationConflict(existingUsers, { username, email });

            if (conflict.conflict) {
                if (conflict.reason === "unverified_email") {
                    logger.warn(`someone tried to register with existing email but not verified: ${email}`);
                    return createResponse(400, "email already exists but not verified , please verify your email");
                }
                logger.warn(`someone tried to register with existing username or email: ${username}, ${email}`);
                return createResponse(400, "cannot register");
            }

            const passwordStrengthCheckResult = passwordStrengthCheck(password);
            if (!passwordStrengthCheckResult.isValid) {
                return createResponse(400, `password does not meet the requirements: ${passwordStrengthCheckResult.missingRequirements.join(", ")}`);
            }
            const hashedPassword = await generateHashedPassword(password);

            // 查詢 standard 計算資源方案
            const standardPlan = await this.getStandardComputeResourcePlan();
            if (!standardPlan) {
                logger.error("Standard compute resource plan not found or error occurred");
                return createResponse(500, "Default compute resource plan not available");
            }
            logger.info(`Assigning standard compute resource plan (ID: ${standardPlan._id}) to user: ${username}`);

            const newRegisterUser = new UsersModel({
                username,
                password_hash: hashedPassword,
                email,
                isVerified: false,
                registeredAt: new Date(),
                compute_resource_plan_id: standardPlan._id
            });

            await newRegisterUser.save();
            logger.info(`user registered successfully: ${username}`);
            
            if (this.canSendEmail(newRegisterUser.lastTimeVerifyEmailSent, 5)) {
                sendVerificationEmail(newRegisterUser.email, generateVerificationToken(newRegisterUser._id));
                newRegisterUser.lastTimeVerifyEmailSent = new Date();
                await newRegisterUser.save();
                return createResponse(200, "user registered successfully");
            } else {
                const minutesLeft = newRegisterUser.lastTimeVerifyEmailSent
                    ? Math.ceil((newRegisterUser.lastTimeVerifyEmailSent.getTime() + 5 * 60 * 1000 - new Date().getTime()) / 60000)
                    : 5;
                return createResponse(400, `please wait ${minutesLeft} minute(s) before resending the verification email`);
            }
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

    /**
     * 取得預設的計算資源方案 (standard)
     * @returns 返回 standard 計算資源方案，如果不存在則返回 null
     */
    private async getStandardComputeResourcePlan(): Promise<Document | null> {
        try {
            const standardPlan = await ComputeResourcePlanModel.findOne({ name: "standard" }).exec();
            return standardPlan;
        } catch (error) {
            logger.error("Error fetching standard compute resource plan:", error);
            return null;
        }
    }
}
