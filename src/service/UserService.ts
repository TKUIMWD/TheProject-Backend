import bcrypt from "bcrypt";
import { Service } from "../abstract/Service";
import { logger } from "../middlewares/log";
import { Document } from "mongoose"
import { DBResp } from "../interfaces/DBResp";
import { resp } from "../utils/resp";
import { UserProfile } from "../interfaces/User";
import { Request } from "express";
import { getUserFromRequest } from "../utils/auth";
import { generateHashedPassword, passwordStrengthCheck } from "../utils/password";
import { sendVerificationEmail } from "../utils/MailSender/VerificationTokenSender";
import { generateVerificationToken } from "../utils/token";


export class UserService extends Service {
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
    * @param Request
    * @returns resp<DBResp<Document> | undefined>
    */
    public async getProfile(Request: Request): Promise<resp<UserProfile | undefined>> {
        const resp: resp<UserProfile | undefined> = {
            code: 200,
            message: "",
            body: undefined
        };

        try {
            const user = await getUserFromRequest(Request);
            if (!user) {
                resp.code = 400;
                resp.message = "invalid token";
                return resp;
            }

            if (!user.isVerified) {
                resp.code = 403;
                resp.message = "user is not verified";
                return resp;
            }

            const profile: UserProfile = {
                username: user.username,
                email: user.email
            };

            resp.body = profile;

        } catch (error) {
            logger.error(`Error getting user profile: ${error}`);
            resp.code = 500;
            resp.message = "Internal server error";
        }

        return resp;
    }

    /** 
    * @param Request (Request.body: {username, email})
    * @returns resp<T> | undefined>
    */
    public async updateProfile(Request: Request): Promise<resp<UserProfile | undefined>> {
        const resp: resp<UserProfile | undefined> = {
            code: 200,
            message: "",
            body: undefined
        };

        try {
            const user = await getUserFromRequest(Request);
            if (!user) {
                resp.code = 400;
                resp.message = "invalid token";
                return resp;
            }

            const { username, email } = Request.body;
            if (!username || !email) {
                resp.code = 400;
                const missingFields = [];
                if (!username) missingFields.push("username");
                if (!email) missingFields.push("email");
                resp.message = `missing required fields: ${missingFields.join(", ")}`;
                return resp;
            }

            user.username = username;
            user.email = email;
            user.isVerified = false;
            await user.save();
            
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
                return resp;
            }

            const profile: UserProfile = {
                username: user.username,
                email: user.email
            };
            resp.message = "Profile updated successfully";
            resp.body = profile;
            logger.info(`User ${user.username} updated profile successfully`);
            
        } catch (error) {
            logger.error(`Error updating profile: ${error}`);
            resp.code = 500;
            resp.message = "Internal server error";
        }
        return resp;
    }

    /**
    * @param Request (Request.body: {oldPassword, newPassword, confirmPassword})
    * @returns resp<DBResp<Document> | undefined>
    */
    public async changePassword(Request: Request): Promise<resp<DBResp<Document> | undefined>> {
        const resp: resp<DBResp<Document> | undefined> = {
            code: 200,
            message: "",
            body: undefined
        };
        try {
            const user = await getUserFromRequest(Request);
            if (!user) {
                resp.code = 400;
                resp.message = "invalid token";
                return resp;
            }

            if (!user.isVerified) {
                resp.code = 403;
                resp.message = "user is not verified";
                return resp;
            }

            const { oldPassword, newPassword, confirmPassword } = Request.body;

            if (!oldPassword || !newPassword || !confirmPassword) {
                resp.code = 400;
                const missingFields = [];
                if (!oldPassword) missingFields.push("oldPassword");
                if (!newPassword) missingFields.push("newPassword");
                if (!confirmPassword) missingFields.push("confirmPassword");
                resp.message = `missing required fields: ${missingFields.join(", ")}`;
                return resp;
            }

            if (newPassword !== confirmPassword) {
                resp.code = 400;
                resp.message = "newPassword and confirmPassword do not match";
                return resp;
            }

            const isMatch = await bcrypt.compare(oldPassword, user.password_hash);
            if (!isMatch) {
                resp.code = 400;
                resp.message = "oldPassword is incorrect";
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
            logger.info(`User ${user.username} changed password successfully`);
            resp.message = "Password changed successfully";
        } catch (error) {
            logger.error(`Error changing password: ${error}`);
            resp.code = 500;
            resp.message = "Internal server error";
        }
        return resp;
    }
}