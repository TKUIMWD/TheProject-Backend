import { AuthResponse } from "../../interfaces/Response/AuthResponse";
import { DBResp } from "../../interfaces/Response/DBResp";
import { logger } from "../../middlewares/log";
import { createResponse, resp } from "../../utils/resp";
import { Document } from "mongoose";

export type AuthSessionUser = {
    email?: string;
    username?: string;
    isVerified: boolean;
    save(): Promise<unknown>;
};

export class AuthSessionService {
    public async verifyEmail(user: AuthSessionUser | null | undefined): Promise<resp<AuthResponse | undefined>> {
        if (user) {
            user.isVerified = true;
            await user.save();
            logger.info(`email verified successfully for ${user.email}`);
        }

        return createResponse(200, "email verified successfully");
    }

    public async logout(user: Pick<AuthSessionUser, "username"> | null | undefined): Promise<resp<DBResp<Document> | undefined>> {
        if (user) {
            logger.info(`logout successful for ${user.username}`);
        }

        return createResponse(200, "logout successful");
    }
}

export const authSessionService = new AuthSessionService();
