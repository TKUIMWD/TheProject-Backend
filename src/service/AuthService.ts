import bcrypt from "bcrypt";
import { Service } from "../abstract/Service";
import { resp } from "../utils/resp";
import { DBResp } from "../interfaces/DBResp";
import { Document } from "mongoose";
import { generatePasswordResetToken, generateToken, generateVerificationToken, verifyToken } from "../utils/token";
import { AuthResponse } from "../interfaces/AuthResponse";
import { logger } from "../middlewares/log";
import { Request, Response } from "express";
import { UsersModel } from "../orm/schemas/UserSchemas";
import { sendVerificationEmail } from "../utils/MailSender/VerificationTokenSender";
import { sendForgotPasswordEmail } from "../utils/MailSender/ForgotPasswordSender";
import { generateHashedPassword, passwordStrengthCheck } from "../utils/password";
import { User } from "../interfaces/User";
import { WrongLoginAttemptModel } from "../orm/schemas/WrongLoginAttemptSchemas";


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
            ? await WrongLoginAttemptModel.findById(user.wrongLoginAttemptId)
            : null;

        if (!wrongLoginAttempt) {
            wrongLoginAttempt = new WrongLoginAttemptModel({
                _id: user._id,
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
        const resp: resp<DBResp<Document> | undefined> = {
            code: 200,
            message: "",
            body: undefined
        };

        try {
            const { username, email, password } = data;
            if (!username || !email || !password) {
                resp.code = 400;
                const missingFields = [];
                if (!username) missingFields.push("username");
                if (!email) missingFields.push("email");
                if (!password) missingFields.push("password");
                resp.message = `missing required fields: ${missingFields.join(", ")}`;
                return resp;
            }

            // check if username or email already exists
            const existingUsername = await UsersModel.findOne({ username });
            const existingEmail = await UsersModel.findOne({ email });

            if (existingUsername || existingEmail) {
                if (existingEmail && existingEmail.isVerified === false) {
                    resp.code = 400;
                    resp.message = "email already exists but not verified , please verify your email";
                    logger.warn(`someone tried to register with existing email but not verified: ${email}`);
                    return resp;
                }
                resp.code = 400;
                resp.message = "cannot register";
                logger.warn(`someone tried to register with existing username or email: ${username}, ${email}`);
                return resp;
            }

            const passwordStrengthCheckResult = passwordStrengthCheck(password);
            if (!passwordStrengthCheckResult.isValid) {
                resp.code = 400;
                resp.message = `password does not meet the requirements: ${passwordStrengthCheckResult.missingRequirements.join(", ")}`;
                return resp;
            }
            const hashedPassword = await generateHashedPassword(password);

            const newRegisterUser = new UsersModel({
                username,
                password_hash: hashedPassword,
                email,
                isVerified: false,
                registeredAt: new Date(),
            });

            await newRegisterUser.save();
            resp.message = "user registered successfully";
            logger.info(`user registered successfully: ${username}`);
            if (this.canSendEmail(newRegisterUser.lastTimeVerifyEmailSent, 5)) {
                sendVerificationEmail(newRegisterUser.email, generateVerificationToken(newRegisterUser._id));
                newRegisterUser.lastTimeVerifyEmailSent = new Date();
                await newRegisterUser.save();
            } else {
                resp.code = 400;
                const minutesLeft = newRegisterUser.lastTimeVerifyEmailSent
                    ? Math.ceil((newRegisterUser.lastTimeVerifyEmailSent.getTime() + 5 * 60 * 1000 - new Date().getTime()) / 60000)
                    : 5;
                resp.message = `please wait ${minutesLeft} minute(s) before resending the verification email`;
            }
        } catch (error) {
            logger.error(error);
            resp.code = 500;
            resp.message = "internal server error";
        }
        return resp;
    }


    public async verify(Request: Request): Promise<resp<AuthResponse | undefined>> {
        const resp: resp<AuthResponse | undefined> = {
            code: 200,
            message: "",
            body: undefined
        };

        try {
            const authHeader = Request.headers.authorization;
            if (!authHeader) {
                resp.code = 400;
                resp.message = "missing authorization header";
                return resp;
            }
            const token = authHeader.split(" ")[1];
            const decoded = verifyToken(token);
            if (!decoded) {
                resp.code = 400;
                resp.message = "invalid token";
                return resp;
            }
            const { _id } = decoded as { _id: string };
            const user = await UsersModel.findById(_id);
            if (user) {
                user.isVerified = true;
                await user.save();
                resp.message = "email verified successfully";
                logger.info(`email verified successfully for ${user.email}`);
            }
            else {
                resp.code = 400;
                resp.message = "invalid token";
                logger.warn(`someone tried to verify with invalid token: ${token}`);
            }
        } catch (error) {
            logger.error(error);
            resp.code = 500;
            resp.message = "internal server error";
        }
        return resp;
    }

    /*
    * @param data : {username:string,password:string}
    * @returns resp<AuthResponse | undefined>
    */
    public async login(data: { username: string, password: string }): Promise<resp<AuthResponse | undefined>> {
        const resp: resp<AuthResponse | undefined> = {
            code: 200,
            message: "",
            body: undefined
        };

        try {
            const { username, password } = data;
            if (!username || !password) {
                resp.code = 400;
                const missingFields = [];
                if (!username) missingFields.push("username");
                if (!password) missingFields.push("password");
                resp.message = `missing required fields: ${missingFields.join(", ")}`;
                return resp;
            }
            const user = await UsersModel.findOne({ username });
            if (!user) {
                resp.code = 400;
                resp.message = "invalid username or password";
                logger.warn(`someone tried to login with invalid username: ${username}`);
                return resp;
            }

            // 檢查是否鎖定
            let wrongLoginAttempt = user.wrongLoginAttemptId
                ? await WrongLoginAttemptModel.findById(user.wrongLoginAttemptId)
                : null;

            if (wrongLoginAttempt && wrongLoginAttempt.lockUntil && wrongLoginAttempt.lockUntil > new Date()) {
                resp.code = 400;
                const minutesLeft = Math.ceil((wrongLoginAttempt.lockUntil.getTime() - new Date().getTime()) / 60000);
                resp.message = `user is locked, please wait ${minutesLeft} minute(s) until the lock is lifted`;
                return resp;
            }
            if (!user.isVerified) {
                resp.code = 400;
                resp.message = "email not verified, please verify your email";
                if (this.canSendEmail(user.lastTimeVerifyEmailSent, 5)) {
                    sendVerificationEmail(user.email, generateVerificationToken(user._id));
                    user.lastTimeVerifyEmailSent = new Date();
                    await user.save();
                } else {
                    resp.code = 400;
                    const minutesLeft = user.lastTimeVerifyEmailSent
                        ? Math.ceil((user.lastTimeVerifyEmailSent.getTime() + 5 * 60 * 1000 - new Date().getTime()) / 60000)
                        : 5;
                    resp.message = `please wait ${minutesLeft} minute(s) before resending the verification email`;
                }
                logger.warn(`someone tried to login with unverified email: ${user.email}`);
                return resp;
            }
            const isMatch = await bcrypt.compare(password, user.password_hash);
            if (!isMatch) {
                await this.handleWrongLoginAttempt(user, 5, 10);
                // 重新檢查鎖定狀態
                wrongLoginAttempt = user.wrongLoginAttemptId
                    ? await WrongLoginAttemptModel.findById(user.wrongLoginAttemptId)
                    : null;
                if (wrongLoginAttempt && wrongLoginAttempt.lockUntil && wrongLoginAttempt.lockUntil > new Date()) {
                    resp.code = 400;
                    const minutesLeft = Math.ceil((wrongLoginAttempt.lockUntil.getTime() - new Date().getTime()) / 60000);
                    resp.message = `user is locked, please wait ${minutesLeft} minute(s) until the lock is lifted`;
                    return resp;
                }
                resp.code = 400;
                resp.message = "invalid username or password";
                logger.warn(`someone tried to login with invalid password: ${username}`);
                return resp;
            } else {
                // 登入成功，檢查並解鎖
                if (wrongLoginAttempt && wrongLoginAttempt.lockUntil && wrongLoginAttempt.lockUntil > new Date()) {
                    resp.code = 400;
                    const minutesLeft = Math.ceil((wrongLoginAttempt.lockUntil.getTime() - new Date().getTime()) / 60000);
                    resp.message = `user is locked, please wait ${minutesLeft} minute(s) until the lock is lifted`;
                    return resp;
                }
                // 自動解鎖並清除錯誤記錄
                if (wrongLoginAttempt && wrongLoginAttempt.lockUntil && wrongLoginAttempt.lockUntil <= new Date()) {
                    user.isLocked = false;
                    await WrongLoginAttemptModel.deleteOne({ _id: user._id });
                    user.wrongLoginAttemptId = undefined;
                    logger.info(`user ${username} is unlocked`);
                    await user.save();
                }
                // 登入成功，清除錯誤記錄
                if (wrongLoginAttempt) {
                    await WrongLoginAttemptModel.deleteOne({ _id: user._id });
                    user.wrongLoginAttemptId = undefined;
                    await user.save();
                }
            }
            const token = generateToken(user._id, user.role, user.username);
            resp.message = "login successful";
            resp.body = { token } as AuthResponse;
            logger.info(`login successful for ${username}`);

        } catch (error) {
            logger.error(error);
            resp.code = 500;
            resp.message = "internal server error";
        }
        return resp;
    }

    public async logout(Request: Request): Promise<resp<DBResp<Document> | undefined>> {
        const resp: resp<DBResp<Document> | undefined> = {
            code: 200,
            message: "",
            body: undefined
        };

        try {
            const authHeader = Request.headers.authorization;
            if (!authHeader) {
                resp.code = 400;
                resp.message = "missing authorization header";
                return resp;
            }
            const token = authHeader.split(" ")[1];
            const decoded = verifyToken(token);
            if (!decoded) {
                resp.code = 400;
                resp.message = "invalid token";
                return resp;
            }
            const { _id } = decoded as { _id: string };
            const user = await UsersModel.findById(_id);
            if (!user) {
                resp.code = 400;
                resp.message = "invalid token";
                return resp;
            }
            resp.message = "logout successful";
            logger.info(`logout successful for ${user.username}`);
        } catch (error) {
            logger.error(error);
            resp.code = 500;
            resp.message = "internal server error";
        }
        return resp;
    }

    public async forgotPassword(Request: Request): Promise<resp<DBResp<Document> | undefined>> {
        const resp: resp<DBResp<Document> | undefined> = {
            code: 200,
            message: "",
            body: undefined
        };

        if (Request.method === "POST") {
            try {
                const email = Request.body.email;
                const user = await UsersModel.findOne({ email });
                if (!user) {
                    resp.code = 200;
                    resp.message = "If the email exists, a password reset email has been sent";
                    return resp;
                }
                if (!email) {
                    resp.code = 400;
                    resp.message = "missing email field";
                    return resp;
                }
                if (this.canSendEmail(user.lastTimePasswordResetEmailSent, 5)) {
                    sendForgotPasswordEmail(email, generatePasswordResetToken(email));
                    user.lastTimePasswordResetEmailSent = new Date();
                    await user.save();
                } else {
                    resp.code = 400;
                    const minutesLeft = user.lastTimePasswordResetEmailSent
                        ? Math.ceil((user.lastTimePasswordResetEmailSent.getTime() + 5 * 60 * 1000 - new Date().getTime()) / 60000)
                        : 5;
                    resp.message = `please wait ${minutesLeft} minute(s) before resending the verification email`;
                    return resp;
                }
                resp.message = "password reset email sent";
            } catch (error) {
                logger.error(error);
                resp.code = 500;
                resp.message = "internal server error";
            }
        }
        else if (Request.method === "PUT") {
            try {
                const authHeader = Request.headers.authorization;
                if (!authHeader) {
                    resp.code = 400;
                    resp.message = "missing authorization header";
                    return resp;
                }
                const token = authHeader.split(" ")[1];
                const decoded = verifyToken(token);
                if (!decoded) {
                    resp.code = 400;
                    resp.message = "invalid token";
                    return resp;
                }
                const { email } = decoded as { email: string };
                const user = await UsersModel.findOne({ email: email });
                if (!user) {
                    resp.code = 400;
                    resp.message = "invalid token";
                    return resp;
                }
                const newPassword = Request.body.password;
                if (!newPassword) {
                    resp.code = 400;
                    resp.message = "missing password field";
                    return resp;
                }
                const passwordStrengthCheckResult = passwordStrengthCheck(newPassword);
                if (!passwordStrengthCheckResult.isValid) {
                    resp.code = 400;
                    resp.message = `password does not meet the requirements: ${passwordStrengthCheckResult.missingRequirements.join(", ")}`;
                    return resp;
                }
                const hashedPassword = await generateHashedPassword(newPassword);
                user.password_hash = hashedPassword;
                await user.save();
                resp.message = "password reset successful";
                logger.info(`password reset successful for ${user.email}`);
            }
            catch (error) {
                logger.error(error);
                resp.code = 500;
                resp.message = "internal server error";
            }
        }
        else {
            resp.code = 400;
            resp.message = "invalid method";
        }
        return resp;
    }
}