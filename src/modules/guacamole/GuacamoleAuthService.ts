import { env } from "../../config/env";
import { GuacamoleAuthToken } from "../../interfaces/Guacamole";
import { logger } from "../../middlewares/log";
import { createResponse, resp } from "../../utils/resp";
import { guacamoleApiClient } from "./GuacamoleApiClient";
import {
    buildGuacamoleAuthTokenDecision,
    DEFAULT_GUACAMOLE_DATA_SOURCE
} from "./GuacamoleAuthPolicy";
import {
    buildCreateConnectionPermissionPatchOperations,
    buildGuacamoleUserCreatePayload,
    classifyGuacamoleUserLookupResponse,
    classifyGuacamoleUserMutationResponse,
    evaluateCreateConnectionPermission
} from "./GuacamoleUserPolicy";

type GuacamoleAuthApi = {
    createToken(username: string, password: string): Promise<unknown>;
    getUser(dataSource: string, username: string, token: string): Promise<unknown>;
    createUser(dataSource: string, userData: Record<string, unknown>, token: string): Promise<unknown>;
    patchUserPermissions(dataSource: string, username: string, patchOperations: Record<string, unknown>[], token: string): Promise<unknown>;
    getUserPermissions(dataSource: string, username: string, token: string): Promise<unknown>;
};

type GuacamoleAuthConfig = {
    apiUsername: string;
    apiPassword: string;
    projectUserPassword: string;
};

const defaultGuacamoleAuthConfig: GuacamoleAuthConfig = {
    apiUsername: env.guacamole.apiUsername,
    apiPassword: env.guacamole.apiPassword,
    projectUserPassword: env.guacamole.projectUserPassword
};

export class GuacamoleAuthService {
    constructor(
        private readonly apiClient: GuacamoleAuthApi = guacamoleApiClient,
        private readonly config: GuacamoleAuthConfig = defaultGuacamoleAuthConfig,
        private readonly schedulePermissionVerification: (callback: () => void) => void = (callback) => {
            setTimeout(callback, 500);
        }
    ) {}

    public async getAdminAuthToken(): Promise<resp<GuacamoleAuthToken | undefined>> {
        try {
            const response = await this.apiClient.createToken(this.config.apiUsername, this.config.apiPassword);
            const tokenDecision = buildGuacamoleAuthTokenDecision(response, {
                username: this.config.apiUsername,
                errorPrefix: "Admin authentication failed",
                missingTokenMessage: "Failed to obtain admin auth token"
            });

            if (!tokenDecision.success) {
                return createResponse(500, tokenDecision.message);
            }

            return createResponse(200, "Admin auth token obtained", tokenDecision.authToken);
        } catch (error) {
            logger.error("Error getting admin auth token:", error);
            return createResponse(500, `Error getting admin auth token: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }

    public async ensureUserAndGetToken(userEmail: string): Promise<resp<GuacamoleAuthToken | undefined>> {
        try {
            const adminTokenResult = await this.getAdminAuthToken();
            if (adminTokenResult.code !== 200 || !adminTokenResult.body) {
                return createResponse(500, "Failed to get admin auth token for dataSource");
            }

            const dataSource = adminTokenResult.body.dataSource || DEFAULT_GUACAMOLE_DATA_SOURCE;
            const { exists } = await this.checkGuacamoleUserExists(userEmail, dataSource, adminTokenResult.body.token);

            if (!exists) {
                logger.info(`Guacamole user ${userEmail} does not exist, creating...`);
                const createResult = await this.createGuacamoleUser(userEmail, dataSource, adminTokenResult.body.token);

                if (!createResult.success) {
                    return createResponse(500, `Failed to create Guacamole user: ${createResult.message}`);
                }
            }

            const response = await this.apiClient.createToken(userEmail, this.config.projectUserPassword);
            const tokenDecision = buildGuacamoleAuthTokenDecision(response, {
                username: userEmail,
                fallbackDataSource: dataSource,
                errorPrefix: "User authentication failed",
                missingTokenMessage: "Failed to obtain user auth token"
            });

            if (tokenDecision.success) {
                logger.info(`Successfully obtained auth token for user: ${userEmail}`);
                return createResponse(200, "User auth token obtained", tokenDecision.authToken);
            }

            return createResponse(500, tokenDecision.message);
        } catch (error) {
            logger.error("Error in ensureUserAndGetToken:", error);
            return createResponse(500, `Error ensuring user and getting token: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }

    public async checkGuacamoleUserExists(
        userEmail: string,
        dataSource: string,
        adminToken?: string
    ): Promise<{ exists: boolean; user?: unknown }> {
        try {
            const token = adminToken || await this.requireAdminToken();
            const userData = await this.apiClient.getUser(dataSource, userEmail, token);
            return classifyGuacamoleUserLookupResponse(userData);
        } catch (error) {
            logger.error("Error checking Guacamole user existence:", error);
            return { exists: false };
        }
    }

    public async createGuacamoleUser(
        userEmail: string,
        dataSource: string,
        adminToken?: string
    ): Promise<{ success: boolean; message: string }> {
        try {
            const token = adminToken || await this.requireAdminToken();
            const userData = buildGuacamoleUserCreatePayload(userEmail, this.config.projectUserPassword);
            const createResp = await this.apiClient.createUser(dataSource, userData, token);
            const createDecision = classifyGuacamoleUserMutationResponse(createResp, "User created successfully");
            if (!createDecision.success) {
                return createDecision;
            }

            logger.info(`Successfully created Guacamole user: ${userEmail}`);
            const permissionResult = await this.setUserPermissions(userEmail, token, dataSource);
            if (permissionResult.success) {
                this.schedulePermissionVerification(() => {
                    this.verifyUserPermissions(userEmail, dataSource)
                        .then((verifyResult) => {
                            logger.info(`Permission verification for ${userEmail}: ${verifyResult.hasPermissions ? "SUCCESS" : "FAILED"} - ${verifyResult.message}`);
                        })
                        .catch((error) => {
                            logger.error("Error in scheduled permission verification:", error);
                        });
                });
                return { success: true, message: "User created and permissions set successfully" };
            }

            logger.error(`User created but failed to set permissions: ${permissionResult.message}`);
            return { success: true, message: `User created but permission setup failed: ${permissionResult.message}` };
        } catch (error) {
            logger.error("Error creating Guacamole user:", error);
            return { success: false, message: error instanceof Error ? error.message : "Unknown error" };
        }
    }

    public async setUserPermissions(userEmail: string, adminToken: string, dataSource: string): Promise<{ success: boolean; message: string }> {
        try {
            const patchOperations = buildCreateConnectionPermissionPatchOperations();

            logger.info(`Setting CREATE_CONNECTION permission for user: ${userEmail}`);
            const response = await this.apiClient.patchUserPermissions(dataSource, userEmail, patchOperations, adminToken);
            return classifyGuacamoleUserMutationResponse(response, "Permissions set successfully");
        } catch (error) {
            logger.error("Error setting user permissions:", error);
            return { success: false, message: error instanceof Error ? error.message : "Unknown error" };
        }
    }

    public async verifyUserPermissions(userEmail: string, dataSource: string): Promise<{ hasPermissions: boolean; message?: string }> {
        try {
            const token = await this.requireAdminToken();
            const permissions = await this.apiClient.getUserPermissions(dataSource, userEmail, token);
            return evaluateCreateConnectionPermission(permissions);
        } catch (error) {
            logger.error("Error verifying user permissions:", error);
            return { hasPermissions: false, message: error instanceof Error ? error.message : "Unknown error" };
        }
    }

    private async requireAdminToken(): Promise<string> {
        const authTokenResult = await this.getAdminAuthToken();
        if (authTokenResult.code !== 200 || !authTokenResult.body) {
            throw new Error("Failed to get admin auth token");
        }
        return authTokenResult.body.token;
    }
}

export const guacamoleAuthService = new GuacamoleAuthService();
