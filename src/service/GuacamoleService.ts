import { Service } from "../abstract/Service";
import { Request } from "express";
import { logger } from "../middlewares/log";
import { createResponse, resp } from "../utils/resp";
import { validateTokenAndGetUser, validateTokenAndGetSuperAdminUser } from "../utils/auth";
import { env } from "../config/env";
import { User } from "../interfaces/User";
import {
    validateGuacamoleConnectionId,
} from "../modules/guacamole/GuacamoleConnectionRequestPolicy";
import { 
    GuacamoleConnection, 
    GuacamoleAuthToken, 
} from "../interfaces/Guacamole";
import { guacamoleAuthService } from "../modules/guacamole/GuacamoleAuthService";
import { DEFAULT_GUACAMOLE_DATA_SOURCE } from "../modules/guacamole/GuacamoleAuthPolicy";
import { guacamoleConnectionManagementService } from "../modules/guacamole/GuacamoleConnectionManagementService";
import { GuacamoleConnectionEstablishmentService } from "../modules/guacamole/GuacamoleConnectionEstablishmentService";
import { guacamoleDisconnectService } from "../modules/guacamole/GuacamoleDisconnectService";

// Guacamole 環境變數配置
const GUACAMOLE_URL = env.guacamole.baseUrl;
const GUACAMOLE_API_USERNAME = env.guacamole.apiUsername;
const GUACAMOLE_API_PASSWORD = env.guacamole.apiPassword;
const PROJECTUSER_GUACAMOLE_PASSWORD = env.guacamole.projectUserPassword;

export class GuacamoleService extends Service {
    private readonly connectionEstablishmentService: GuacamoleConnectionEstablishmentService;

    constructor() {
        super();
        this.connectionEstablishmentService = new GuacamoleConnectionEstablishmentService({
            guacamoleBaseUrl: GUACAMOLE_URL,
            isConfigured: () => this._checkGuacamoleConfiguration(),
            getAuthToken: (user) => this._getGuacamoleAuthTokenForUser(user)
        });
    }

    /**
     * 檢查 Guacamole 服務配置是否完整
     */
    private _checkGuacamoleConfiguration(): boolean {
        return !!(GUACAMOLE_URL && GUACAMOLE_API_USERNAME && GUACAMOLE_API_PASSWORD && PROJECTUSER_GUACAMOLE_PASSWORD);
    }

    /**
     * 驗證用戶權限
     */
    private async _validateUserPermissions(req: Request): Promise<{ user: User; isSuperAdmin: boolean } | { error: resp<undefined> }> {
        try {
            // 優先嘗試 SuperAdmin 驗證
            const { user: superUser, error: superError } = await validateTokenAndGetSuperAdminUser<User>(req);
            if (!superError && superUser && superUser._id) {
                return { user: superUser, isSuperAdmin: true };
            }

            // 嘗試一般用戶驗證
            const { user, error: userError } = await validateTokenAndGetUser<User>(req);
            if (!userError && user && user._id) {
                return { user, isSuperAdmin: false };
            }

            logger.error("Authentication failed for GuacamoleService:", userError || superError);
            return { error: createResponse(401, "Authentication failed") };

        } catch (error) {
            logger.error("Error validating user permissions:", error);
            return { error: createResponse(500, "Internal Server Error") };
        }
    }

    /**
     * 獲取 Guacamole 認證令牌 (使用用戶信箱和統一密碼)
     */
    private async _getGuacamoleAuthToken(req: Request): Promise<resp<GuacamoleAuthToken | undefined>> {
        try {
            // 檢查 Guacamole 服務配置
            if (!this._checkGuacamoleConfiguration()) {
                logger.error("Guacamole configuration missing:", {
                    url: !!GUACAMOLE_URL,
                    username: !!GUACAMOLE_API_USERNAME,
                    password: !!GUACAMOLE_API_PASSWORD,
                    userPassword: !!PROJECTUSER_GUACAMOLE_PASSWORD
                });
                return createResponse(503, "Guacamole service is not configured. Please contact administrator to configure the service.");
            }

            // 驗證用戶權限並獲取用戶信息
            const userValidation = await this._validateUserPermissions(req);
            if ('error' in userValidation) {
                return userValidation.error;
            }

            return this._getGuacamoleAuthTokenForUser(userValidation.user);

        } catch (error) {
            logger.error("Error in _getGuacamoleAuthToken:", {
                message: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            return createResponse(500, `Error getting Guacamole auth token: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async _getGuacamoleAuthTokenForUser(user: User): Promise<resp<GuacamoleAuthToken | undefined>> {
        if (!user.email) {
            return createResponse(400, "User email is required for Guacamole authentication");
        }

        logger.info(`Requesting Guacamole auth token for user: ${user.email}`);
        return guacamoleAuthService.ensureUserAndGetToken(user.email);
    }

    /**
     * 建立 SSH 連線
     */
    public async establishSSHConnection(req: Request): Promise<resp<GuacamoleConnection | undefined>> {
        try {
            const userValidation = await this._validateUserPermissions(req);
            if ('error' in userValidation) {
                return userValidation.error;
            }

            return this.connectionEstablishmentService.establishSSHConnection({
                request: req.body,
                user: userValidation.user,
                isSuperAdmin: userValidation.isSuperAdmin
            });
        } catch (error) {
            logger.error("Error establishing SSH connection:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * 建立 RDP 連線
     */
    public async establishRDPConnection(req: Request): Promise<resp<GuacamoleConnection | undefined>> {
        try {
            const userValidation = await this._validateUserPermissions(req);
            if ('error' in userValidation) {
                return userValidation.error;
            }

            return this.connectionEstablishmentService.establishRDPConnection({
                request: req.body,
                user: userValidation.user,
                isSuperAdmin: userValidation.isSuperAdmin
            });
        } catch (error) {
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * 建立 VNC 連線
     */
    public async establishVNCConnection(req: Request): Promise<resp<GuacamoleConnection | undefined>> {
        try {
            const userValidation = await this._validateUserPermissions(req);
            if ('error' in userValidation) {
                return userValidation.error;
            }

            return this.connectionEstablishmentService.establishVNCConnection({
                request: req.body,
                user: userValidation.user,
                isSuperAdmin: userValidation.isSuperAdmin
            });
        } catch (error) {
            logger.error("Error establishing VNC connection:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * 斷開 Guacamole 連線
     */
    public async disconnectGuacamoleConnection(req: Request): Promise<resp<{ message: string } | undefined>> {
        try {
            // 驗證用戶權限
            const userValidation = await this._validateUserPermissions(req);
            if ('error' in userValidation) {
                return userValidation.error;
            }

            return guacamoleDisconnectService.disconnect({
                user: userValidation.user,
                body: req.body
            });

        } catch (error) {
            logger.error("Error disconnecting Guacamole connection:", error);
            return createResponse(500, `Error disconnecting connection: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * 列出用戶的連接
     */
    public async listUserConnections(req: Request): Promise<resp<any[] | undefined>> {
        try {
            // 檢查 Guacamole 服務配置
            if (!this._checkGuacamoleConfiguration()) {
                logger.error("Guacamole service is not configured for listing connections");
                return createResponse(503, "Guacamole service is not configured. Please contact administrator to configure the service.");
            }

            // 驗證用戶權限
            const userValidation = await this._validateUserPermissions(req);
            if ('error' in userValidation) {
                return userValidation.error;
            }

            const { user } = userValidation;

            // 獲取 Guacamole 認證令牌
            const authTokenResult = await this._getGuacamoleAuthTokenForUser(user);
            if (authTokenResult.code !== 200 || !authTokenResult.body) {
                return createResponse(500, "Failed to authenticate with Guacamole service");
            }

            const dataSource = authTokenResult.body.dataSource || DEFAULT_GUACAMOLE_DATA_SOURCE;
            
            return guacamoleConnectionManagementService.listUserConnections({
                userEmail: user.email,
                token: authTokenResult.body.token,
                dataSource
            });

        } catch (error) {
            logger.error("Error listing user connections:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * 刪除 Guacamole 連接
     */
    public async deleteConnection(req: Request): Promise<resp<any>> {
        try {
            // 檢查 Guacamole 服務配置
            if (!this._checkGuacamoleConfiguration()) {
                logger.error("Guacamole service is not configured");
                return createResponse(503, "Guacamole service is not configured. Please contact administrator to configure the service.");
            }

            // 驗證用戶權限
            const userValidation = await this._validateUserPermissions(req);
            if ('error' in userValidation) {
                return userValidation.error;
            }

            const { user, isSuperAdmin } = userValidation;
            const { connection_id } = req.body;

            const connectionIdResult = validateGuacamoleConnectionId(connection_id);
            if (!connectionIdResult.valid) {
                return createResponse(400, connectionIdResult.message);
            }

            return guacamoleConnectionManagementService.deleteConnection({
                connectionId: connectionIdResult.connectionId,
                user,
                isSuperAdmin
            });

        } catch (error) {
            logger.error("Error deleting connection:", error);
            return createResponse(500, "Internal Server Error");
        }
    }
}
