import { logger } from "../../middlewares/log";
import { createResponse, resp } from "../../utils/resp";
import { guacamoleApiClient } from "./GuacamoleApiClient";
import {
    buildGuacamoleCreateConnectionFailureMessage,
    classifyGuacamoleCreateConnectionResponse,
    findGuacamoleConnectionIdByName
} from "./GuacamoleConnectionLifecyclePolicy";

type GuacamoleConnectionProtocol = "ssh" | "rdp" | "vnc";

type GuacamoleConnectionConfigApi = {
    listConnections(dataSource: string, token: string): Promise<unknown>;
    createConnection(dataSource: string, connectionConfig: Record<string, unknown>, token: string): Promise<unknown>;
};

export type GuacamoleConnectionConfigInput = {
    protocol: GuacamoleConnectionProtocol;
    dataSource: string;
    token: string;
    connectionName: string;
    connectionConfig: Record<string, unknown>;
    hostname: string;
    port: number;
};

export class GuacamoleConnectionConfigService {
    constructor(private readonly apiClient: GuacamoleConnectionConfigApi = guacamoleApiClient) {}

    public async getOrCreateConnectionConfig(input: GuacamoleConnectionConfigInput): Promise<resp<string | undefined>> {
        logger.debug(`${input.protocol.toUpperCase()} connection lookup started for ${input.connectionName}`);

        let existingConnections: unknown;
        try {
            existingConnections = await this.apiClient.listConnections(input.dataSource, input.token);
        } catch (listError) {
            logger.warn(`Unable to list existing ${input.protocol.toUpperCase()} connections; creating a new connection for ${input.connectionName}`);
            existingConnections = null;
        }

        const existingConfigId = findGuacamoleConnectionIdByName(existingConnections, input.connectionName);
        if (existingConfigId) {
            logger.debug(`Using existing ${input.protocol.toUpperCase()} Guacamole config ${existingConfigId}`);
            return createResponse(200, "Guacamole connection config ready", existingConfigId);
        }

        logger.debug(`Creating ${input.protocol.toUpperCase()} Guacamole config for ${input.connectionName} at ${input.hostname}:${input.port}`);
        const configResponse = await this.apiClient.createConnection(input.dataSource, input.connectionConfig, input.token);
        const createDecision = classifyGuacamoleCreateConnectionResponse(configResponse);
        if (!createDecision.success) {
            const message = buildGuacamoleCreateConnectionFailureMessage(input.protocol, createDecision, {
                hostname: input.hostname,
                port: input.port
            });
            logger.error(`${input.protocol.toUpperCase()} Guacamole config creation failed: ${message}`);
            return createResponse(500, message);
        }

        logger.debug(`Created ${input.protocol.toUpperCase()} Guacamole config ${createDecision.identifier}`);
        return createResponse(200, "Guacamole connection config ready", createDecision.identifier);
    }
}

export const guacamoleConnectionConfigService = new GuacamoleConnectionConfigService();
