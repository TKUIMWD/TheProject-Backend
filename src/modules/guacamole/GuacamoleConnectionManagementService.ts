import { User } from "../../interfaces/User";
import { logger } from "../../middlewares/log";
import { createResponse, resp } from "../../utils/resp";
import { guacamoleApiClient } from "./GuacamoleApiClient";
import { DEFAULT_GUACAMOLE_DATA_SOURCE } from "./GuacamoleAuthPolicy";
import { guacamoleAuthService } from "./GuacamoleAuthService";
import {
    buildGuacamoleDeleteConnectionSuccessPayload,
    classifyGuacamoleDeleteConnectionResponse
} from "./GuacamoleConnectionLifecyclePolicy";
import { buildUserGuacamoleConnectionListDTOs } from "./GuacamoleConnectionListDTOFactory";
import { canDeleteGuacamoleConnectionByName } from "./GuacamoleConnectionPermissionPolicy";

type GuacamoleConnectionManagementApi = {
    listConnections(dataSource: string, token: string): Promise<unknown>;
    getConnection(dataSource: string, connectionId: string, token: string): Promise<any>;
    deleteConnection(dataSource: string, connectionId: string, token: string): Promise<unknown>;
};

type GuacamoleAuthProvider = {
    getAdminAuthToken(): Promise<resp<{ token: string; dataSource?: string } | undefined>>;
};

export class GuacamoleConnectionManagementService {
    constructor(
        private readonly apiClient: GuacamoleConnectionManagementApi = guacamoleApiClient,
        private readonly authProvider: GuacamoleAuthProvider = guacamoleAuthService
    ) {}

    public async listUserConnections(input: {
        userEmail: string;
        token: string;
        dataSource?: string;
    }): Promise<resp<any[] | undefined>> {
        const dataSource = input.dataSource || DEFAULT_GUACAMOLE_DATA_SOURCE;

        try {
            logger.debug(`Listing Guacamole connections for user ${input.userEmail}`);

            const connectionsResponse = await this.apiClient.listConnections(dataSource, input.token);
            if (!connectionsResponse || typeof connectionsResponse !== "object") {
                logger.debug(`No Guacamole connections found for user ${input.userEmail}`);
                return createResponse(200, "No connections found", []);
            }

            const userConnections = buildUserGuacamoleConnectionListDTOs(connectionsResponse, input.userEmail);

            logger.info(`Listed ${userConnections.length} connections for user ${input.userEmail}`);
            return createResponse(200, `Found ${userConnections.length} connections`, userConnections);
        } catch (guacError) {
            logger.error("Guacamole API error while listing connections:", guacError);
            return createResponse(500, `Failed to list connections from Guacamole: ${guacError instanceof Error ? guacError.message : "Unknown error"}`);
        }
    }

    public async deleteConnection(input: {
        connectionId: string;
        user: User;
        isSuperAdmin: boolean;
    }): Promise<resp<any>> {
        const authTokenResult = await this.authProvider.getAdminAuthToken();
        if (authTokenResult.code !== 200 || !authTokenResult.body) {
            return createResponse(500, "Failed to authenticate with Guacamole service");
        }

        const dataSource = authTokenResult.body.dataSource || DEFAULT_GUACAMOLE_DATA_SOURCE;
        const permissionCheck = await this.validateConnectionDeletePermission({
            connectionId: input.connectionId,
            user: input.user,
            isSuperAdmin: input.isSuperAdmin,
            authToken: authTokenResult.body.token,
            dataSource
        });

        if (!permissionCheck.valid) {
            return createResponse(403, permissionCheck.message || "Access denied");
        }

        const connectionData = permissionCheck.connectionData;
        const connectionName = connectionData?.name || `connection-${input.connectionId}`;

        try {
            logger.debug(`Deleting Guacamole connection ${input.connectionId} (${connectionName})`);

            const deleteResponse = await this.apiClient.deleteConnection(dataSource, input.connectionId, authTokenResult.body.token);
            const deleteDecision = classifyGuacamoleDeleteConnectionResponse(deleteResponse);
            if (!deleteDecision.success) {
                return createResponse(deleteDecision.statusCode, deleteDecision.message);
            }

            logger.info(`Connection ${input.connectionId} (${connectionName}) deleted successfully by user ${input.user.email} (${input.isSuperAdmin ? "SuperAdmin" : "User"})`);

            return createResponse(
                200,
                "Connection deleted successfully",
                buildGuacamoleDeleteConnectionSuccessPayload({
                    connectionId: input.connectionId,
                    connectionName,
                    deletedBy: input.user.email
                })
            );
        } catch (guacError) {
            logger.error("Guacamole API error while deleting connection:", guacError);
            return createResponse(500, `Failed to delete connection: ${guacError instanceof Error ? guacError.message : "Unknown error"}`);
        }
    }

    public async validateConnectionDeletePermission(input: {
        connectionId: string;
        user: User;
        isSuperAdmin: boolean;
        authToken: string;
        dataSource: string;
    }): Promise<{ valid: boolean; message?: string; connectionData?: any }> {
        try {
            if (input.isSuperAdmin) {
                logger.info(`SuperAdmin ${input.user.email} attempting to delete connection ${input.connectionId}`);

                try {
                    const connectionData = await this.apiClient.getConnection(input.dataSource, input.connectionId, input.authToken);
                    return { valid: true, connectionData };
                } catch (error) {
                    logger.error("Error fetching connection data for SuperAdmin:", error);
                    return { valid: true };
                }
            }

            try {
                const connectionData = await this.apiClient.getConnection(input.dataSource, input.connectionId, input.authToken);

                logger.debug(`Checking Guacamole connection delete permission for user ${input.user.email} and connection ${input.connectionId}`);

                const connectionName = (connectionData as any)?.name;
                const permissionDecision = canDeleteGuacamoleConnectionByName(input.user.email, connectionName, false);
                if (!permissionDecision.allowed) {
                    logger.warn(`User ${input.user.email} cannot delete connection ${input.connectionId} (${connectionName || "unknown"}): ${permissionDecision.message}`);
                    return { valid: false, message: permissionDecision.message };
                }

                logger.info(`User ${input.user.email} has permission to delete connection ${input.connectionId} (${connectionName})`);
                return { valid: true, connectionData };
            } catch (error) {
                logger.error("Error fetching connection data for permission check:", error);
                return { valid: false, message: "Connection not found or access denied" };
            }
        } catch (error) {
            logger.error("Error validating connection delete permission:", error);
            return { valid: false, message: "Error validating connection permission" };
        }
    }
}

export const guacamoleConnectionManagementService = new GuacamoleConnectionManagementService();
