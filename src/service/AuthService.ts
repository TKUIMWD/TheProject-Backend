import { Service } from "../abstract/Service";
import { resp, createResponse } from "../utils/resp";
import { DBResp } from "../interfaces/Response/DBResp";
import { Document } from "mongoose";
import { AuthResponse } from "../interfaces/Response/AuthResponse";
import { logger } from "../middlewares/log";
import { authForgotPasswordService } from "../modules/auth/AuthForgotPasswordService";
import { authLoginService } from "../modules/auth/AuthLoginService";
import { authRegistrationService } from "../modules/auth/AuthRegistrationService";
import { authSessionService } from "../modules/auth/AuthSessionService";

export type ForgotPasswordServiceInput = {
    method: string;
    body?: {
        email?: string;
        password?: string;
    };
    authorizationHeader?: string;
};

type AuthServiceDeps = {
    registration?: {
        canSendEmail(lastTimeSent: Date | null | undefined, intervalMinutes: number): boolean;
        register(data: { username: string, email: string, password: string }): Promise<resp<DBResp<Document> | undefined>>;
    };
    login?: {
        login(data: { email: string, password: string }): Promise<resp<AuthResponse | undefined>>;
    };
    forgotPassword?: {
        handle(input: ForgotPasswordServiceInput): Promise<resp<DBResp<Document> | undefined>>;
    };
    session?: {
        verifyEmail(user: any): Promise<resp<AuthResponse | undefined>>;
        logout(user: any): Promise<resp<DBResp<Document> | undefined>>;
    };
};

export class AuthService extends Service {
    private readonly registration: NonNullable<AuthServiceDeps["registration"]>;
    private readonly loginService: NonNullable<AuthServiceDeps["login"]>;
    private readonly forgotPasswordService: NonNullable<AuthServiceDeps["forgotPassword"]>;
    private readonly sessionService: NonNullable<AuthServiceDeps["session"]>;

    constructor(deps: AuthServiceDeps = {}) {
        super();
        this.registration = deps.registration ?? authRegistrationService;
        this.loginService = deps.login ?? authLoginService;
        this.forgotPasswordService = deps.forgotPassword ?? authForgotPasswordService;
        this.sessionService = deps.session ?? authSessionService;
    }

    public canSendEmail(lastTimeSent: Date | null | undefined, intervalMinutes: number): boolean {
        return this.registration.canSendEmail(lastTimeSent, intervalMinutes);
    }

    public async register(data: { username: string, email: string, password: string }): Promise<resp<DBResp<Document> | undefined>> {
        try {
            return this.registration.register(data);
        } catch (error) {
            logger.error(error);
            return createResponse(500, "internal server error");
        }
    }

    public async verify(user: any): Promise<resp<AuthResponse | undefined>> {
        try {
            return this.sessionService.verifyEmail(user);
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
            return this.loginService.login(data);
        } catch (error) {
            logger.error(error);
            return createResponse(500, "internal server error");
        }
    }

    public async logout(user: any): Promise<resp<DBResp<Document> | undefined>> {
        try {
            return this.sessionService.logout(user);
        } catch (error) {
            logger.error(error);
            return createResponse(500, "internal server error");
        }
    }

    public async forgotPassword(input: ForgotPasswordServiceInput): Promise<resp<DBResp<Document> | undefined>> {
        return this.forgotPasswordService.handle(input);
    }
}
