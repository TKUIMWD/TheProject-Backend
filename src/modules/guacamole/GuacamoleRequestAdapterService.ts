import { env } from "../../config/env";
import { GuacamoleAuthToken, GuacamoleConnection, GuacamoleDisconnectRequest } from "../../interfaces/Guacamole";
import { User } from "../../interfaces/User";
import { logger } from "../../middlewares/log";
import { createResponse, resp } from "../../utils/resp";
import { DEFAULT_GUACAMOLE_DATA_SOURCE } from "./GuacamoleAuthPolicy";
import { guacamoleAuthService } from "./GuacamoleAuthService";
import { GuacamoleConnectionEstablishmentService } from "./GuacamoleConnectionEstablishmentService";
import { guacamoleConnectionManagementService } from "./GuacamoleConnectionManagementService";
import { validateGuacamoleConnectionId } from "./GuacamoleConnectionRequestPolicy";
import { guacamoleDisconnectService } from "./GuacamoleDisconnectService";

type GuacamoleActorInput = {
    user: User;
    isSuperAdmin: boolean;
    body?: any;
};

type GuacamoleEstablishmentPort = {
    establishSSHConnection(input: { request: any; user: User; isSuperAdmin: boolean }): Promise<resp<GuacamoleConnection | undefined>>;
    establishRDPConnection(input: { request: any; user: User; isSuperAdmin: boolean }): Promise<resp<GuacamoleConnection | undefined>>;
    establishVNCConnection(input: { request: any; user: User; isSuperAdmin: boolean }): Promise<resp<GuacamoleConnection | undefined>>;
};

type GuacamoleDisconnectPort = {
    disconnect(input: { user: User; body: GuacamoleDisconnectRequest }): Promise<resp<{ message: string } | undefined>>;
};

type GuacamoleConnectionManagementPort = {
    listUserConnections(input: { userEmail: string; token: string; dataSource?: string }): Promise<resp<any[] | undefined>>;
    deleteConnection(input: { connectionId: string; user: User; isSuperAdmin: boolean }): Promise<resp<any>>;
};

type GuacamoleRequestAdapterServiceDeps = {
    connectionEstablishment?: GuacamoleEstablishmentPort;
    disconnect?: GuacamoleDisconnectPort;
    connectionManagement?: GuacamoleConnectionManagementPort;
    isConfigured?: () => boolean;
    getAuthToken?: (user: User) => Promise<resp<GuacamoleAuthToken | undefined>>;
};

function isDefaultGuacamoleConfigured(): boolean {
    return !!(
        env.guacamole.baseUrl &&
        env.guacamole.apiUsername &&
        env.guacamole.apiPassword &&
        env.guacamole.projectUserPassword
    );
}

export class GuacamoleRequestAdapterService {
    private readonly connectionEstablishment: GuacamoleEstablishmentPort;
    private readonly disconnectService: GuacamoleDisconnectPort;
    private readonly connectionManagement: GuacamoleConnectionManagementPort;
    private readonly isConfigured: () => boolean;
    private readonly getAuthToken: (user: User) => Promise<resp<GuacamoleAuthToken | undefined>>;

    constructor(deps: GuacamoleRequestAdapterServiceDeps = {}) {
        this.isConfigured = deps.isConfigured ?? isDefaultGuacamoleConfigured;
        this.getAuthToken = deps.getAuthToken ?? this.getGuacamoleAuthTokenForUser;
        this.connectionEstablishment = deps.connectionEstablishment ?? new GuacamoleConnectionEstablishmentService({
            guacamoleBaseUrl: env.guacamole.baseUrl,
            isConfigured: this.isConfigured,
            getAuthToken: this.getAuthToken
        });
        this.disconnectService = deps.disconnect ?? guacamoleDisconnectService;
        this.connectionManagement = deps.connectionManagement ?? guacamoleConnectionManagementService;
    }

    public establishSSHConnection(input: GuacamoleActorInput): Promise<resp<GuacamoleConnection | undefined>> {
        return this.connectionEstablishment.establishSSHConnection(this.toConnectionInput(input));
    }

    public establishRDPConnection(input: GuacamoleActorInput): Promise<resp<GuacamoleConnection | undefined>> {
        return this.connectionEstablishment.establishRDPConnection(this.toConnectionInput(input));
    }

    public establishVNCConnection(input: GuacamoleActorInput): Promise<resp<GuacamoleConnection | undefined>> {
        return this.connectionEstablishment.establishVNCConnection(this.toConnectionInput(input));
    }

    public disconnectGuacamoleConnection(input: GuacamoleActorInput): Promise<resp<{ message: string } | undefined>> {
        return this.disconnectService.disconnect({
            user: input.user,
            body: input.body
        });
    }

    public async listUserConnections(input: { user: User }): Promise<resp<any[] | undefined>> {
        if (!this.isConfigured()) {
            return this.guacamoleNotConfigured("Guacamole service is not configured for listing connections");
        }

        const authTokenResult = await this.getAuthToken(input.user);
        if (authTokenResult.code !== 200 || !authTokenResult.body) {
            return createResponse(500, "Failed to authenticate with Guacamole service");
        }

        return this.connectionManagement.listUserConnections({
            userEmail: input.user.email,
            token: authTokenResult.body.token,
            dataSource: authTokenResult.body.dataSource || DEFAULT_GUACAMOLE_DATA_SOURCE
        });
    }

    public deleteConnection(input: GuacamoleActorInput): Promise<resp<any>> {
        if (!this.isConfigured()) {
            return Promise.resolve(this.guacamoleNotConfigured("Guacamole service is not configured"));
        }

        const connectionIdResult = validateGuacamoleConnectionId(input.body?.connection_id);
        if (!connectionIdResult.valid) {
            return Promise.resolve(createResponse(400, connectionIdResult.message));
        }

        return this.connectionManagement.deleteConnection({
            connectionId: connectionIdResult.connectionId,
            user: input.user,
            isSuperAdmin: input.isSuperAdmin
        });
    }

    private toConnectionInput(input: GuacamoleActorInput): { request: any; user: User; isSuperAdmin: boolean } {
        return {
            request: input.body,
            user: input.user,
            isSuperAdmin: input.isSuperAdmin
        };
    }

    private async getGuacamoleAuthTokenForUser(user: User): Promise<resp<GuacamoleAuthToken | undefined>> {
        if (!user.email) {
            return createResponse(400, "User email is required for Guacamole authentication");
        }

        logger.info(`Requesting Guacamole auth token for user: ${user.email}`);
        return guacamoleAuthService.ensureUserAndGetToken(user.email);
    }

    private guacamoleNotConfigured(logMessage: string): resp<undefined> {
        logger.error(logMessage);
        return createResponse(503, "Guacamole service is not configured. Please contact administrator to configure the service.");
    }
}

export const guacamoleRequestAdapterService = new GuacamoleRequestAdapterService();
