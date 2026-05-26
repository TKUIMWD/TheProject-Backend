import { Service } from "../abstract/Service";
import { resp, createResponse } from "../utils/resp";
import { DBResp } from "../interfaces/Response/DBResp";
import { Document } from "mongoose";
import { AuthResponse } from "../interfaces/Response/AuthResponse";
import { logger } from "../middlewares/log";
import { Request } from "express";
import { validateTokenAndGetUser } from "../utils/auth";
import { authForgotPasswordService } from "../modules/auth/AuthForgotPasswordService";
import { authLoginService } from "../modules/auth/AuthLoginService";
import { authRegistrationService } from "../modules/auth/AuthRegistrationService";
import { authSessionService } from "../modules/auth/AuthSessionService";


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
        return this.withAuthenticatedUser<AuthResponse>(Request, (user) => authSessionService.verifyEmail(user));
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
        return this.withAuthenticatedUser<DBResp<Document>>(Request, (user) => authSessionService.logout(user));
    }

    public async forgotPassword(Request: Request): Promise<resp<DBResp<Document> | undefined>> {
        return authForgotPasswordService.handle({
            method: Request.method,
            body: Request.body,
            authorizationHeader: Request.headers.authorization
        });
    }

    private async withAuthenticatedUser<T>(
        Request: Request,
        action: (user: any) => Promise<resp<T | undefined>>
    ): Promise<resp<T | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<T>(Request);
            if (error) {
                return error;
            }

            return action(user);
        } catch (error) {
            logger.error(error);
            return createResponse(500, "internal server error");
        }
    }
}
