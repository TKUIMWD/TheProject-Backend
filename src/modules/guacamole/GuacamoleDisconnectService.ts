import { env } from "../../config/env";
import { GuacamoleAuthToken, GuacamoleDisconnectRequest } from "../../interfaces/Guacamole";
import { User } from "../../interfaces/User";
import { logger } from "../../middlewares/log";
import { createResponse, resp } from "../../utils/resp";
import { guacamoleApiClient } from "./GuacamoleApiClient";
import { guacamoleAuthService } from "./GuacamoleAuthService";
import { buildGuacamoleDisconnectSuccessPayload } from "./GuacamoleConnectionLifecyclePolicy";
import { validateGuacamoleConnectionId } from "./GuacamoleConnectionRequestPolicy";

type GuacamoleDisconnectApi = {
    deleteActiveConnection(dataSource: string, connectionId: string, token: string): Promise<unknown>;
};

type GuacamoleUserTokenProvider = {
    ensureUserAndGetToken(userEmail: string): Promise<resp<GuacamoleAuthToken | undefined>>;
};

type GuacamoleDisconnectServiceDeps = {
    apiClient?: GuacamoleDisconnectApi;
    authProvider?: GuacamoleUserTokenProvider;
    isConfigured?: () => boolean;
};

function isDefaultGuacamoleConfigured(): boolean {
    return !!(
        env.guacamole.baseUrl &&
        env.guacamole.apiUsername &&
        env.guacamole.apiPassword &&
        env.guacamole.projectUserPassword
    );
}

export class GuacamoleDisconnectService {
    private readonly apiClient: GuacamoleDisconnectApi;
    private readonly authProvider: GuacamoleUserTokenProvider;
    private readonly isConfigured: () => boolean;

    constructor(deps: GuacamoleDisconnectServiceDeps = {}) {
        this.apiClient = deps.apiClient ?? guacamoleApiClient;
        this.authProvider = deps.authProvider ?? guacamoleAuthService;
        this.isConfigured = deps.isConfigured ?? isDefaultGuacamoleConfigured;
    }

    public async disconnect(input: {
        user: User;
        body: GuacamoleDisconnectRequest;
    }): Promise<resp<{ message: string; connection_id: string; disconnected_at: string } | undefined>> {
        try {
            if (!this.isConfigured()) {
                logger.error("Guacamole service is not configured for disconnect operation");
                return createResponse(503, "Guacamole service is not configured. Please contact administrator to configure the service.");
            }

            const connectionIdResult = validateGuacamoleConnectionId(input.body.connection_id);
            if (!connectionIdResult.valid) {
                return createResponse(400, connectionIdResult.message);
            }

            logger.info(`Attempting to disconnect Guacamole connection ${connectionIdResult.connectionId} for user ${input.user.username}`);

            if (input.body.guacamole_connection_id) {
                const guacamoleConnectionIdResult = validateGuacamoleConnectionId(
                    input.body.guacamole_connection_id,
                    "Guacamole connection ID"
                );
                if (!guacamoleConnectionIdResult.valid) {
                    return createResponse(400, guacamoleConnectionIdResult.message);
                }

                const authTokenResult = await this.getUserAuthToken(input.user);
                if (authTokenResult.code !== 200 || !authTokenResult.body) {
                    logger.error("Failed to get auth token for disconnect");
                    return createResponse(500, "Failed to authenticate with Guacamole service for disconnect");
                }

                try {
                    await this.apiClient.deleteActiveConnection(
                        "default",
                        guacamoleConnectionIdResult.connectionId,
                        authTokenResult.body.token
                    );
                    logger.info(`Successfully killed Guacamole active connection ${guacamoleConnectionIdResult.connectionId} via API`);
                } catch (apiError) {
                    logger.error(`Failed to kill Guacamole connection via API: ${apiError instanceof Error ? apiError.message : "Unknown error"}`);
                    return createResponse(500, "Failed to disconnect connection via Guacamole API");
                }
            }

            return createResponse(
                200,
                "Connection disconnected successfully",
                buildGuacamoleDisconnectSuccessPayload(connectionIdResult.connectionId)
            );
        } catch (error) {
            logger.error("Error in GuacamoleDisconnectService.disconnect:", error);
            return createResponse(500, `Error disconnecting connection: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }

    private async getUserAuthToken(user: User): Promise<resp<GuacamoleAuthToken | undefined>> {
        if (!user.email) {
            return createResponse(400, "User email is required for Guacamole authentication");
        }

        logger.info(`Requesting Guacamole auth token for user: ${user.email}`);
        return this.authProvider.ensureUserAndGetToken(user.email);
    }
}

export const guacamoleDisconnectService = new GuacamoleDisconnectService();
