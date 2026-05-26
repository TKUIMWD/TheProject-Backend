import { GuacamoleAuthToken, GuacamoleConnection, GuacamoleConnectionRequest } from "../../interfaces/Guacamole";
import { User } from "../../interfaces/User";
import { logger } from "../../middlewares/log";
import { createResponse, resp } from "../../utils/resp";
import {
    buildRDPConnectionProfile,
    buildSSHConnectionProfile,
    buildVNCConnectionProfile,
    normalizeTerminalFontSize
} from "./ConnectionProfileFactory";
import { buildEstablishedGuacamoleConnection } from "./GuacamoleConnectionDTOFactory";
import { GuacamoleConnectionConfigService, guacamoleConnectionConfigService } from "./GuacamoleConnectionConfigService";
import {
    validateGuacamoleConnectionTarget
} from "./GuacamoleConnectionRequestPolicy";
import { buildGuacamoleDirectUrl } from "./GuacamoleDirectUrl";
import {
    buildGuacamoleConnectionEstablishedLogMessage,
    buildGuacamoleConnectionEstablishedMessage,
    buildGuacamoleConnectionEstablishFailureMessage,
    buildGuacamoleDirectSessionLogMessage
} from "./GuacamoleEstablishedConnectionPolicy";
import {
    buildGuacamoleConfigurationMissingLogMessage,
    GUACAMOLE_SERVICE_NOT_CONFIGURED_MESSAGE
} from "./GuacamoleConnectionPreflightPolicy";
import {
    GuacamoleConnectionPreflightContext,
    GuacamoleConnectionPreflightService,
    GuacamoleConnectionProtocol,
    GuacamoleConnectionTarget
} from "./GuacamoleConnectionPreflightService";

type GuacamoleConnectionProfile = { name: string; config: Record<string, unknown> };

type GuacamoleConnectionEstablishmentInput = {
    request: GuacamoleConnectionRequest;
    user: User;
    isSuperAdmin: boolean;
};

type GuacamoleConnectionEstablishmentServiceDeps = {
    guacamoleBaseUrl: string;
    isConfigured: () => boolean;
    getAuthToken: (user: User) => Promise<resp<GuacamoleAuthToken | undefined>>;
    configService?: Pick<GuacamoleConnectionConfigService, "getOrCreateConnectionConfig">;
    preparePreflight?: (input: {
        protocol: GuacamoleConnectionProtocol;
        user: User;
        isSuperAdmin: boolean;
        connectionTarget: GuacamoleConnectionTarget;
        requestedIp?: string;
    }) => Promise<GuacamoleConnectionPreflightContext>;
    directUrlBuilder?: (baseUrl: string, configId: string, dataSource: string, token: string) => string;
    nowMs?: () => number;
};

export class GuacamoleConnectionEstablishmentService {
    private readonly guacamoleBaseUrl: string;
    private readonly isConfigured: () => boolean;
    private readonly getAuthToken: (user: User) => Promise<resp<GuacamoleAuthToken | undefined>>;
    private readonly configService: Pick<GuacamoleConnectionConfigService, "getOrCreateConnectionConfig">;
    private readonly preparePreflightOverride?: GuacamoleConnectionEstablishmentServiceDeps["preparePreflight"];
    private readonly directUrlBuilder: (baseUrl: string, configId: string, dataSource: string, token: string) => string;
    private readonly nowMs: () => number;

    constructor(deps: GuacamoleConnectionEstablishmentServiceDeps) {
        this.guacamoleBaseUrl = deps.guacamoleBaseUrl;
        this.isConfigured = deps.isConfigured;
        this.getAuthToken = deps.getAuthToken;
        this.configService = deps.configService ?? guacamoleConnectionConfigService;
        this.preparePreflightOverride = deps.preparePreflight;
        this.directUrlBuilder = deps.directUrlBuilder ?? buildGuacamoleDirectUrl;
        this.nowMs = deps.nowMs ?? Date.now;
    }

    public async establishSSHConnection(input: GuacamoleConnectionEstablishmentInput): Promise<resp<GuacamoleConnection | undefined>> {
        const request = input.request;
        const sshFontSize = normalizeTerminalFontSize(request.font_size);
        return this.establishConnection({
            protocol: "ssh",
            request,
            user: input.user,
            isSuperAdmin: input.isSuperAdmin,
            buildProfile: ({ user, preflight, connectionTarget }) => buildSSHConnectionProfile({
                vmName: preflight.vmName,
                email: user.email,
                hostname: preflight.networkInfo.ip,
                port: connectionTarget.port,
                username: request.username,
                password: request.password,
                fontSize: sshFontSize,
                nowMs: this.nowMs()
            })
        });
    }

    public async establishRDPConnection(input: GuacamoleConnectionEstablishmentInput): Promise<resp<GuacamoleConnection | undefined>> {
        const request = input.request;
        const username = request.username;
        const password = request.password;
        if (!username || !password) {
            return createResponse(400, "Username and password are required for RDP connection");
        }

        return this.establishConnection({
            protocol: "rdp",
            request,
            user: input.user,
            isSuperAdmin: input.isSuperAdmin,
            buildProfile: ({ user, preflight, connectionTarget }) => buildRDPConnectionProfile({
                vmName: preflight.vmName,
                email: user.email,
                hostname: preflight.networkInfo.ip,
                port: connectionTarget.port,
                username,
                password
            })
        });
    }

    public async establishVNCConnection(input: GuacamoleConnectionEstablishmentInput): Promise<resp<GuacamoleConnection | undefined>> {
        const request = input.request;
        return this.establishConnection({
            protocol: "vnc",
            request,
            user: input.user,
            isSuperAdmin: input.isSuperAdmin,
            buildProfile: ({ user, preflight, connectionTarget }) => buildVNCConnectionProfile({
                vmName: preflight.vmName,
                email: user.email,
                hostname: preflight.networkInfo.ip,
                port: connectionTarget.port,
                password: request.password
            })
        });
    }

    private async establishConnection(input: {
        protocol: GuacamoleConnectionProtocol;
        request: GuacamoleConnectionRequest;
        user: User;
        isSuperAdmin: boolean;
        buildProfile: (input: {
            user: User;
            preflight: Exclude<GuacamoleConnectionPreflightContext, { error: resp<GuacamoleConnection | undefined> }>;
            connectionTarget: GuacamoleConnectionTarget;
        }) => GuacamoleConnectionProfile;
    }): Promise<resp<GuacamoleConnection | undefined>> {
        if (!this.isConfigured()) {
            logger.error(buildGuacamoleConfigurationMissingLogMessage(input.protocol));
            return createResponse(503, GUACAMOLE_SERVICE_NOT_CONFIGURED_MESSAGE);
        }

        const { user, isSuperAdmin } = input;
        const connectionTarget = validateGuacamoleConnectionTarget({
            vm_id: input.request.vm_id,
            port: input.request.port
        }, input.protocol);
        if (!connectionTarget.valid) {
            return createResponse(400, connectionTarget.message);
        }

        const preflight = await this.prepareConnectionPreflight({
            protocol: input.protocol,
            user,
            isSuperAdmin,
            connectionTarget,
            requestedIp: input.request.ip_address
        });
        if ("error" in preflight) {
            return preflight.error;
        }

        try {
            return this.finalizeEstablishedConnection({
                protocol: input.protocol,
                user,
                connectionTarget,
                preflight,
                connectionProfile: input.buildProfile({ user, preflight, connectionTarget })
            });
        } catch (guacError) {
            if (input.protocol === "vnc") {
                logger.error("Error creating Guacamole VNC connection:", guacError);
            }
            return createResponse(500, buildGuacamoleConnectionEstablishFailureMessage(input.protocol, guacError));
        }
    }

    private async prepareConnectionPreflight(input: {
        protocol: GuacamoleConnectionProtocol;
        user: User;
        isSuperAdmin: boolean;
        connectionTarget: GuacamoleConnectionTarget;
        requestedIp?: string;
    }): Promise<GuacamoleConnectionPreflightContext> {
        if (this.preparePreflightOverride) {
            return this.preparePreflightOverride(input);
        }

        const service = new GuacamoleConnectionPreflightService({
            getAuthToken: this.getAuthToken
        });

        return service.prepare(input);
    }

    private async finalizeEstablishedConnection(input: {
        protocol: GuacamoleConnectionProtocol;
        user: User;
        connectionTarget: GuacamoleConnectionTarget;
        preflight: Exclude<GuacamoleConnectionPreflightContext, { error: resp<GuacamoleConnection | undefined> }>;
        connectionProfile: GuacamoleConnectionProfile;
    }): Promise<resp<GuacamoleConnection | undefined>> {
        const configIdResult = await this.configService.getOrCreateConnectionConfig({
            protocol: input.protocol,
            dataSource: input.preflight.dataSource,
            token: input.preflight.authToken.token,
            connectionName: input.connectionProfile.name,
            connectionConfig: input.connectionProfile.config,
            hostname: input.preflight.networkInfo.ip,
            port: input.connectionTarget.port
        });
        if (configIdResult.code !== 200 || !configIdResult.body) {
            return createResponse(configIdResult.code, configIdResult.message);
        }

        const directUrl = this.directUrlBuilder(
            this.guacamoleBaseUrl,
            configIdResult.body,
            input.preflight.dataSource,
            input.preflight.authToken.token
        );
        logger.debug(`Generated Guacamole direct connection URL for config ${configIdResult.body} using data source ${input.preflight.dataSource}`);
        logger.debug(buildGuacamoleDirectSessionLogMessage(input.protocol, configIdResult.body));

        const connection = buildEstablishedGuacamoleConnection({
            protocol: input.protocol,
            vmId: input.connectionTarget.vmId,
            targetIp: input.preflight.networkInfo.ip,
            availableIps: input.preflight.networkInfo.allIPs,
            directUrl,
            guacamoleBaseUrl: this.guacamoleBaseUrl,
            guacamoleToken: input.preflight.authToken.token,
            guacamoleDataSource: input.preflight.dataSource,
            guacamoleConnectionId: configIdResult.body
        });

        logger.info(buildGuacamoleConnectionEstablishedLogMessage({
            protocol: input.protocol,
            username: input.user.username,
            vmId: input.connectionTarget.vmId,
            pveVmid: input.preflight.vm.pve_vmid,
            ip: input.preflight.networkInfo.ip
        }));

        return createResponse(200, buildGuacamoleConnectionEstablishedMessage(input.protocol), connection);
    }
}
