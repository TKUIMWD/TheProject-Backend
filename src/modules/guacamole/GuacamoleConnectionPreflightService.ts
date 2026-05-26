import * as net from "net";
import { Request } from "express";
import { logger } from "../../middlewares/log";
import { GuacamoleAuthToken, GuacamoleConnection } from "../../interfaces/Guacamole";
import { User } from "../../interfaces/User";
import { resp, createResponse } from "../../utils/resp";
import { VMUtils } from "../../utils/VMUtils";
import { vmRepository } from "../vm/VMRepository";
import { DEFAULT_GUACAMOLE_DATA_SOURCE } from "./GuacamoleAuthPolicy";
import {
    buildGuacamoleServiceConnectivityFailureMessage,
    buildGuacamoleVMDisplayName,
    GUACAMOLE_AUTHENTICATION_FAILURE_MESSAGE
} from "./GuacamoleConnectionPreflightPolicy";
import {
    extractIPv4AddressesFromGuestInterfaces,
    selectGuacamoleTargetIP
} from "./GuacamoleVMNetworkPolicy";

export type GuacamoleConnectionProtocol = "ssh" | "rdp" | "vnc";
export type GuacamoleConnectionTarget = { vmId: string; port: number };
export type GuacamoleConnectionPreflightContext =
    | { error: resp<GuacamoleConnection | undefined> }
    | {
        vm: any;
        vmName: string;
        networkInfo: { ip: string; allIPs?: string[] };
        authToken: GuacamoleAuthToken;
        dataSource: string;
    };

type VMRepositoryPort = {
    findById(vmId: string): Promise<any | null>;
};

type VMUtilsPort = {
    getVMStatus(pveNode: string, pveVmid: string): Promise<{ status: string; uptime?: number } | null>;
    getVMNetworkInfo(pveNode: string, pveVmid: string): Promise<{ success: boolean; interfaces?: any[]; errorMessage?: string }>;
    getVMConfig(pveNode: string, pveVmid: string): Promise<any>;
};

export type GuacamoleConnectionPreflightServiceDeps = {
    vmRepository?: VMRepositoryPort;
    vmUtils?: VMUtilsPort;
    getAuthToken?: (req: Request) => Promise<resp<GuacamoleAuthToken | undefined>>;
    checkConnectivity?: (hostname: string, port: number, serviceName: string) => Promise<{ connected: boolean; message?: string }>;
};

export class GuacamoleConnectionPreflightService {
    private readonly vmRepository: VMRepositoryPort;
    private readonly vmUtils: VMUtilsPort;
    private readonly getAuthToken?: (req: Request) => Promise<resp<GuacamoleAuthToken | undefined>>;
    private readonly checkConnectivity: (hostname: string, port: number, serviceName: string) => Promise<{ connected: boolean; message?: string }>;

    constructor(deps: GuacamoleConnectionPreflightServiceDeps = {}) {
        this.vmRepository = deps.vmRepository ?? vmRepository;
        this.vmUtils = deps.vmUtils ?? VMUtils;
        this.getAuthToken = deps.getAuthToken;
        this.checkConnectivity = deps.checkConnectivity ?? defaultCheckConnectivity;
    }

    public async prepare(input: {
        req: Request;
        protocol: GuacamoleConnectionProtocol;
        user: User;
        isSuperAdmin: boolean;
        connectionTarget: GuacamoleConnectionTarget;
        requestedIp?: string;
    }): Promise<GuacamoleConnectionPreflightContext> {
        const vmPermission = await this.validateVMPermission(input.user._id!.toString(), input.connectionTarget.vmId, input.isSuperAdmin);
        if (!vmPermission.valid) {
            return { error: createResponse(403, vmPermission.message || "Access denied") };
        }

        const vm = vmPermission.vm;
        const vmStatus = await this.checkVMStatus(vm);
        if (!vmStatus.running) {
            return { error: createResponse(400, vmStatus.message || "VM is not running") };
        }

        const networkInfo = await this.getVMNetworkInfo(vm, input.requestedIp);
        if (!networkInfo.ip) {
            return { error: createResponse(400, networkInfo.message || "Unable to get or validate VM IP address") };
        }

        const connectivityCheck = await this.checkConnectivity(
            networkInfo.ip,
            input.connectionTarget.port,
            input.protocol.toUpperCase()
        );
        if (!connectivityCheck.connected) {
            if (input.protocol === "vnc") {
                logger.warn(`VNC service not accessible on ${networkInfo.ip}:${input.connectionTarget.port} for VM ${input.connectionTarget.vmId}`);
            }
            return {
                error: createResponse(503, buildGuacamoleServiceConnectivityFailureMessage(
                    input.protocol,
                    networkInfo.ip,
                    input.connectionTarget.port,
                    connectivityCheck.message
                ))
            };
        }

        const vmConfig = await this.vmUtils.getVMConfig(vm.pve_node, vm.pve_vmid);
        const vmName = buildGuacamoleVMDisplayName(vmConfig, vm.pve_vmid);
        const authTokenResult = await this.requireAuthToken(input.req);
        if (authTokenResult.code !== 200 || !authTokenResult.body) {
            if (input.protocol === "vnc") {
                logger.error("Failed to get Guacamole auth token for VNC connection");
            }
            return { error: createResponse(500, GUACAMOLE_AUTHENTICATION_FAILURE_MESSAGE) };
        }

        return {
            vm,
            vmName,
            networkInfo: {
                ip: networkInfo.ip,
                allIPs: networkInfo.allIPs
            },
            authToken: authTokenResult.body,
            dataSource: authTokenResult.body.dataSource || DEFAULT_GUACAMOLE_DATA_SOURCE
        };
    }

    private async validateVMPermission(userId: string, vmId: string, isSuperAdmin: boolean): Promise<{ valid: boolean; vm?: any; message?: string }> {
        try {
            const vm = await this.vmRepository.findById(vmId);
            if (!vm) return { valid: false, message: "VM not found" };
            if (isSuperAdmin) return { valid: true, vm };
            if (vm.owner !== userId) return { valid: false, message: "You don't have permission to access this VM" };
            return { valid: true, vm };
        } catch (error) {
            logger.error("Error validating VM permission:", error);
            return { valid: false, message: "Error validating VM permission" };
        }
    }

    private async checkVMStatus(vm: any): Promise<{ running: boolean; message?: string }> {
        try {
            const vmStatus = await this.vmUtils.getVMStatus(vm.pve_node, vm.pve_vmid);
            if (!vmStatus) return { running: false, message: "Unable to get VM status" };
            if (vmStatus.status !== 'running') {
                return { running: false, message: `VM is not running (current status: ${vmStatus.status})` };
            }
            return { running: true };
        } catch (error) {
            logger.error("Error checking VM status:", error);
            return { running: false, message: "Error checking VM status" };
        }
    }

    private async getVMNetworkInfo(vm: any, requestedIP?: string): Promise<{ ip?: string; allIPs?: string[]; message?: string }> {
        try {
            const networkInfo = await this.vmUtils.getVMNetworkInfo(vm.pve_node, vm.pve_vmid);
            if (!networkInfo.success) return { message: networkInfo.errorMessage || "Unable to get VM network information" };
            if (!networkInfo.interfaces || networkInfo.interfaces.length === 0) {
                return { message: "No network interfaces found. QEMU Guest Agent may not be running." };
            }

            const allIPAddresses = extractIPv4AddressesFromGuestInterfaces(networkInfo.interfaces);
            const targetDecision = selectGuacamoleTargetIP(allIPAddresses, requestedIP);
            if (!targetDecision.selected) {
                if (requestedIP && targetDecision.allIPs) {
                    logger.warn(`Requested IP ${requestedIP} is not valid for VM ${vm.pve_vmid}. Available IPs: ${targetDecision.allIPs.join(', ')}`);
                }
                return {
                    message: targetDecision.message,
                    allIPs: targetDecision.allIPs
                };
            }

            if (targetDecision.autoSelected) {
                logger.info(`Auto-selected IP ${targetDecision.ip} for VM ${vm.pve_vmid} (from ${targetDecision.allIPs.length} available IPs)`);
            } else {
                logger.info(`Using requested IP ${targetDecision.ip} for VM ${vm.pve_vmid}`);
            }
            logger.info(`VM ${vm.pve_vmid} network info - Target IP: ${targetDecision.ip}, All IPs: ${targetDecision.allIPs.join(', ')}, Interfaces count: ${networkInfo.interfaces.length}`);

            return {
                ip: targetDecision.ip,
                allIPs: targetDecision.allIPs
            };
        } catch (error) {
            logger.error("Error getting VM network info:", error);
            return { message: "Error getting VM network information" };
        }
    }

    private async requireAuthToken(req: Request): Promise<resp<GuacamoleAuthToken | undefined>> {
        if (!this.getAuthToken) {
            return createResponse(500, GUACAMOLE_AUTHENTICATION_FAILURE_MESSAGE);
        }

        return this.getAuthToken(req);
    }
}

function defaultCheckConnectivity(hostname: string, port: number, serviceName: string): Promise<{ connected: boolean; message?: string }> {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        const timeout = setTimeout(() => {
            socket.destroy();
            resolve({
                connected: false,
                message: `${serviceName} service connection timeout (${hostname}:${port})`
            });
        }, 5000);

        socket.connect(port, hostname, () => {
            clearTimeout(timeout);
            socket.destroy();
            resolve({ connected: true });
        });

        socket.on('error', (error: Error) => {
            clearTimeout(timeout);
            socket.destroy();
            resolve({
                connected: false,
                message: `${serviceName} service not available at ${hostname}:${port} - ${error.message}`
            });
        });
    });
}
