import bcrypt from "bcrypt";
import { Service } from "../abstract/Service";
import { resp , createResponse } from "../utils/resp";
import { DBResp } from "../interfaces/Response/DBResp";
import { Document } from "mongoose";
import { generatePasswordResetToken, generateToken, generateVerificationToken } from "../utils/token";
import { AuthResponse } from "../interfaces/Response/AuthResponse";
import { logger } from "../middlewares/log";
import { Request, Response } from "express";
import { UsersModel } from "../orm/schemas/UserSchemas";
import { sendVerificationEmail } from "../utils/MailSender/VerificationTokenSender";
import { sendForgotPasswordEmail } from "../utils/MailSender/ForgotPasswordSender";
import { generateHashedPassword, passwordStrengthCheck } from "../utils/password";
import { User } from "../interfaces/User";
import { WrongLoginAttemptModel } from "../orm/schemas/WrongLoginAttemptSchemas";
import { validateTokenAndGetUser, validatePasswordResetTokenAndGetUser } from "../utils/auth";
import { ComputeResourcePlanModel } from "../orm/schemas/ComputeResourcePlanSchemas";


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

    /**
     * Handles wrong login attempts for a user.
     * Locks the user if too many failed attempts within the interval.
     * @param user - The user document.
     * @param intervalMinutes - The interval in minutes to check for failed attempts.
     */
    async handleWrongLoginAttempt(user: Document & User, intervalMinutes: number, maxWrongLoginAttemptCount: number): Promise<void> {
        const now = new Date();
        const intervalMs = intervalMinutes * 60 * 1000;
        let wrongLoginAttempt = user.wrongLoginAttemptId
            ? await WrongLoginAttemptModel.findOne({ user_id: user._id })
            : null;

        if (!wrongLoginAttempt) {
            wrongLoginAttempt = new WrongLoginAttemptModel({
                user_id: user._id,
                wrongLoginAttemptStartTime: now,
                wrongLoginAttemptCount: 1,
                lockUntil: null,
            });
            await wrongLoginAttempt.save();
            user.wrongLoginAttemptId = wrongLoginAttempt._id;
            await user.save();
            return;
        }

        // 若帳號已鎖且未解鎖，直接 return
        if (wrongLoginAttempt.lockUntil && wrongLoginAttempt.lockUntil > now) {
            return;
        }

        // 若鎖定已過期，自動解鎖並重設
        if (wrongLoginAttempt.lockUntil && wrongLoginAttempt.lockUntil <= now) {
            wrongLoginAttempt.lockUntil = undefined;
            wrongLoginAttempt.wrongLoginAttemptCount = 0;
            wrongLoginAttempt.wrongLoginAttemptStartTime = now;
        }

        // 判斷是否超過 interval
        if (!wrongLoginAttempt.wrongLoginAttemptStartTime || (now.getTime() - wrongLoginAttempt.wrongLoginAttemptStartTime.getTime()) > intervalMs) {
            wrongLoginAttempt.wrongLoginAttemptStartTime = now;
            wrongLoginAttempt.wrongLoginAttemptCount = 1;
        } else {
            wrongLoginAttempt.wrongLoginAttemptCount = (wrongLoginAttempt.wrongLoginAttemptCount ?? 0) + 1;
        }

        // 達到上限則鎖定
        if ((wrongLoginAttempt.wrongLoginAttemptCount ?? 0) >= maxWrongLoginAttemptCount) {
            wrongLoginAttempt.lockUntil = new Date(now.getTime() + intervalMs);
            user.isLocked = true;
        }

        await wrongLoginAttempt.save();
        await user.save();
    }

    /*
    * @param data : {username:string,email:string,password:string}
    * @returns resp<DBResp<Document> | undefined>
    */
    public async register(data: { username: string, email: string, password: string }): Promise<resp<DBResp<Document> | undefined>> {
        try {
            const { username, email, password } = data;
            if (!username || !email || !password) {
                const missingFields = [];
                if (!username) missingFields.push("username");
                if (!email) missingFields.push("email");
                if (!password) missingFields.push("password");
                return createResponse(400, `missing required fields: ${missingFields.join(", ")}`);
            }

            // check if username or email already exists
            const existingUsername = await UsersModel.findOne({ username });
            const existingEmail = await UsersModel.findOne({ email });

            if (existingUsername || existingEmail) {
                if (existingEmail && existingEmail.isVerified === false) {
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
            const { email, password } = data;
            if (!email || !password) {
                const missingFields = [];
                if (!email) missingFields.push("email");
                if (!password) missingFields.push("password");
                return createResponse(400, `missing required fields: ${missingFields.join(", ")}`);
            }
            const user = await UsersModel.findOne({ email });
            if (!user) {
                logger.warn(`someone tried to login with invalid email: ${email}`);
                return createResponse(400, "invalid email or password");
            }

            // 檢查是否鎖定
            let wrongLoginAttempt = user.wrongLoginAttemptId
                ? await WrongLoginAttemptModel.findOne({ user_id: user._id })
                : null;

            if (wrongLoginAttempt && wrongLoginAttempt.lockUntil && wrongLoginAttempt.lockUntil > new Date()) {
                const minutesLeft = Math.ceil((wrongLoginAttempt.lockUntil.getTime() - new Date().getTime()) / 60000);
                return createResponse(400, `user is locked, please wait ${minutesLeft} minute(s) until the lock is lifted`);
            }
            if (!user.isVerified) {
                if (this.canSendEmail(user.lastTimeVerifyEmailSent, 5)) {
                    sendVerificationEmail(user.email, generateVerificationToken(user._id));
                    user.lastTimeVerifyEmailSent = new Date();
                    await user.save();
                    logger.warn(`someone tried to login with unverified email: ${user.email}`);
                    return createResponse(400, "email not verified, please verify your email");
                } else {
                    const minutesLeft = user.lastTimeVerifyEmailSent
                        ? Math.ceil((user.lastTimeVerifyEmailSent.getTime() + 5 * 60 * 1000 - new Date().getTime()) / 60000)
                        : 5;
                    logger.warn(`someone tried to login with unverified email: ${user.email}`);
                    return createResponse(400, `please wait ${minutesLeft} minute(s) before resending the verification email`);
                }
            }
            const isMatch = await bcrypt.compare(password, user.password_hash);
            if (!isMatch) {
                await this.handleWrongLoginAttempt(user, 5, 10);
                // 重新檢查鎖定狀態
                wrongLoginAttempt = user.wrongLoginAttemptId
                    ? await WrongLoginAttemptModel.findOne({ user_id: user._id })
                    : null;
                if (wrongLoginAttempt && wrongLoginAttempt.lockUntil && wrongLoginAttempt.lockUntil > new Date()) {
                    const minutesLeft = Math.ceil((wrongLoginAttempt.lockUntil.getTime() - new Date().getTime()) / 60000);
                    return createResponse(400, `user is locked, please wait ${minutesLeft} minute(s) until the lock is lifted`);
                }
                logger.warn(`someone tried to login with invalid password: ${email}`);
                return createResponse(400, "invalid email or password");
            } else {
                // 登入成功，檢查並解鎖
                if (wrongLoginAttempt && wrongLoginAttempt.lockUntil && wrongLoginAttempt.lockUntil > new Date()) {
                    const minutesLeft = Math.ceil((wrongLoginAttempt.lockUntil.getTime() - new Date().getTime()) / 60000);
                    return createResponse(400, `user is locked, please wait ${minutesLeft} minute(s) until the lock is lifted`);
                }
                // 自動解鎖並清除錯誤記錄
                if (wrongLoginAttempt && wrongLoginAttempt.lockUntil && wrongLoginAttempt.lockUntil <= new Date()) {
                    user.isLocked = false;
                    await WrongLoginAttemptModel.deleteOne({ user_id: user._id });
                    user.wrongLoginAttemptId = undefined;
                    logger.info(`user ${user.email} is unlocked`);
                    await user.save();
                }
                // 登入成功，清除錯誤記錄
                if (wrongLoginAttempt) {
                    await WrongLoginAttemptModel.deleteOne({ user_id: user._id });
                    user.wrongLoginAttemptId = undefined;
                    await user.save();
                }
            }
            const token = generateToken(user._id, user.role, user.username);
            logger.info(`login successful for ${user.email}`);
            return createResponse(200, "login successful", { token } as AuthResponse);

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