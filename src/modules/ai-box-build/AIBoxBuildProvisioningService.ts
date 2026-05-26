import { Request } from "express";
import { pve_api } from "../../enum/PVE_API";
import { AIBoxBuildExecutionStatus } from "../../interfaces/AIBoxBuildJob";
import { pveClient } from "../pve/PVEClient";
import { VMManageService } from "../../service/VMManageService";
import { VMUtils, GuestAgentCommandResult } from "../../utils/VMUtils";
import { resp } from "../../utils/resp";
import { env } from "../../config/env";
import { aiBoxBuildJobRepository } from "./AIBoxBuildJobRepository";
import { AIBoxRunRequest } from "./AIBoxBuildRunPolicy";
import { buildAIBoxRunLogPushUpdate } from "./AIBoxBuildRunLogPolicy";
import { vmRepository } from "../vm/VMRepository";
import {
    buildAIBoxVMBootFailureMessage,
    buildAIBoxVMBootTaskFailureMessage,
    buildAIBoxVMCreatedLogMessage,
    buildAIBoxVMCreationFailureMessage,
    buildCloudInitAlreadyConfiguredLogMessage,
    buildCloudInitApplyLogMessage,
    buildCloudInitConfigUnavailableLogMessage,
    buildCloudInitRegeneratedLogMessage,
    buildCloudInitRegenerationFailureLogMessage,
    buildCloudInitRegenerationTaskFailureLogMessage,
    buildCloudInitSkippedLogMessage,
    buildGuestNetworkIdentityFailureLogMessage,
    buildGuestNetworkIdentitySkippedLogMessage,
    buildGuestNetworkIdentityStartLogMessage,
    buildGuestNetworkIdentitySuccessLogMessage,
    buildVMIPDetectedLogMessage,
    buildVMIPWaitLogMessage,
    selectPreferredVMIPAddress
} from "./AIBoxBuildProvisioningPolicy";

type VMManageServicePort = {
    createVMFromTemplate(request: Request): Promise<resp<any>>;
};

type JobRepositoryPort = {
    updateById(jobId: string, update: unknown): Promise<unknown>;
};

type VMRepositoryPort = {
    findByOwnerAndPVE(ownerId: string, pveNode: string, pveVmid: string): Promise<any | null>;
};

type VMUtilsPort = {
    getVMStatus(pveNode: string, pveVmid: string): Promise<{ status: string; uptime?: number } | null>;
    startVM(pveNode: string, pveVmid: string): Promise<{ success: boolean; upid?: string; errorMessage?: string }>;
    waitForTaskCompletion(pveNode: string, upid: string, operationType?: string): Promise<{ success: boolean; errorMessage?: string }>;
    getVMConfig(pveNode: string, pveVmid: string): Promise<any>;
    regenerateCloudInit(pveNode: string, pveVmid: string): Promise<{ success: boolean; upid?: string; errorMessage?: string }>;
    ensureUniqueGuestNetworkIdentity(pveNode: string, pveVmid: string, timeoutMs?: number): Promise<GuestAgentCommandResult>;
    getVMNetworkInfo(pveNode: string, pveVmid: string): Promise<{ success: boolean; interfaces?: any[]; errorMessage?: string }>;
    extractIPAddresses(interfaces: any[]): string[];
};

type PVEClientPort = {
    request(method: "PUT", url: string, body?: Record<string, unknown>): Promise<unknown>;
};

export type AIBoxBuildProvisioningConfig = {
    prepareCloudInit: boolean;
    ipconfig0?: string;
    normalizeGuestNetwork: boolean;
    guestIdentityTimeoutMs: number;
    ipWaitAttempts: number;
    ipWaitMs: number;
    vmRecordWaitAttempts: number;
    vmRecordWaitMs: number;
};

export type AIBoxBuildProvisioningServiceDeps = {
    vmManageService?: VMManageServicePort;
    jobRepository?: JobRepositoryPort;
    vmRepository?: VMRepositoryPort;
    vmUtils?: VMUtilsPort;
    pveClient?: PVEClientPort;
    config?: Partial<AIBoxBuildProvisioningConfig>;
    sleep?: (ms: number) => Promise<void>;
};

const defaultConfig = (): AIBoxBuildProvisioningConfig => ({
    prepareCloudInit: env.opencode.prepareCloudInit,
    ipconfig0: env.opencode.ipconfig0,
    normalizeGuestNetwork: env.opencode.normalizeGuestNetwork,
    guestIdentityTimeoutMs: env.opencode.guestIdentityTimeoutMs,
    ipWaitAttempts: env.opencode.ipWaitAttempts,
    ipWaitMs: env.opencode.ipWaitMs,
    vmRecordWaitAttempts: 20,
    vmRecordWaitMs: 1000
});

const defaultSleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

export class AIBoxBuildProvisioningService {
    private readonly vmManageService: VMManageServicePort;
    private readonly jobRepository: JobRepositoryPort;
    private readonly vmRepository: VMRepositoryPort;
    private readonly vmUtils: VMUtilsPort;
    private readonly pveClient: PVEClientPort;
    private readonly config: AIBoxBuildProvisioningConfig;
    private readonly sleep: (ms: number) => Promise<void>;

    constructor(deps: AIBoxBuildProvisioningServiceDeps = {}) {
        this.vmManageService = deps.vmManageService ?? new VMManageService();
        this.jobRepository = deps.jobRepository ?? aiBoxBuildJobRepository;
        this.vmRepository = deps.vmRepository ?? vmRepository;
        this.vmUtils = deps.vmUtils ?? VMUtils;
        this.pveClient = deps.pveClient ?? pveClient;
        this.config = { ...defaultConfig(), ...(deps.config ?? {}) };
        this.sleep = deps.sleep ?? defaultSleep;
    }

    public async provisionAndBootVM(input: {
        jobId: string;
        config: AIBoxRunRequest;
        authorizationHeader: string;
        userSnapshot: { _id: string; role: string; email?: string };
    }): Promise<{ vmId?: string; pveVmid: string; pveNode: string; vmIp: string; sshUser: string; sshPassword: string }> {
        await this.setExecutionStatus(input.jobId, AIBoxBuildExecutionStatus.provisioning, "Creating VM from template.");
        const createResp = await this.vmManageService.createVMFromTemplate({
            headers: { authorization: input.authorizationHeader },
            body: {
                template_id: input.config.template_id,
                name: input.config.name,
                target: input.config.target,
                cpuCores: input.config.cpuCores,
                memorySize: input.config.memorySize,
                diskSize: input.config.diskSize,
                ciuser: input.config.ciuser,
                cipassword: input.config.cipassword
            }
        } as Request);

        if (createResp.code !== 200 || !createResp.body) {
            throw new Error(buildAIBoxVMCreationFailureMessage(createResp.code, createResp.message));
        }

        const body = createResp.body as any;
        const pveVmid = String(body.vmid || "");
        const pveNode = input.config.target;
        const taskId = String(body.task_id || "");
        await this.jobRepository.updateById(
            input.jobId,
            {
                pve_vmid: pveVmid,
                pve_node: pveNode,
                task_id: taskId,
                updated_at: new Date(),
                ...buildAIBoxRunLogPushUpdate("provision", "info", buildAIBoxVMCreatedLogMessage(pveNode, pveVmid))
            }
        );

        const vmRecord = await this.waitForVMRecord(input.userSnapshot._id, pveNode, pveVmid);
        if (vmRecord?._id) {
            await this.jobRepository.updateById(input.jobId, { vm_id: vmRecord._id.toString(), updated_at: new Date() });
        }

        await this.prepareCloudInitBeforeBoot(input.jobId, pveNode, pveVmid);
        await this.setExecutionStatus(input.jobId, AIBoxBuildExecutionStatus.booting, "Booting VM.");
        const status = await this.vmUtils.getVMStatus(pveNode, pveVmid);
        if (status?.status !== "running") {
            const start = await this.vmUtils.startVM(pveNode, pveVmid);
            if (!start.success) {
                throw new Error(buildAIBoxVMBootFailureMessage(start.errorMessage));
            }
            if (start.upid) {
                const wait = await this.vmUtils.waitForTaskCompletion(pveNode, start.upid, "VM start");
                if (!wait.success) {
                    throw new Error(buildAIBoxVMBootTaskFailureMessage(wait.errorMessage));
                }
            }
        }

        await this.normalizeGuestNetworkIdentityAfterBoot(input.jobId, pveNode, pveVmid);
        await this.setExecutionStatus(input.jobId, AIBoxBuildExecutionStatus.waiting_for_network, "Waiting for VM network address.");
        const vmIp = await this.waitForVMIP(input.jobId, pveNode, pveVmid);
        await this.jobRepository.updateById(input.jobId, { vm_ip: vmIp, updated_at: new Date() });

        return {
            vmId: vmRecord?._id?.toString(),
            pveVmid,
            pveNode,
            vmIp,
            sshUser: input.config.ciuser || "root",
            sshPassword: input.config.cipassword || ""
        };
    }

    private async prepareCloudInitBeforeBoot(jobId: string, pveNode: string, pveVmid: string): Promise<void> {
        if (!this.config.prepareCloudInit) {
            await this.appendRunLog(jobId, "cloud-init", "warning", buildCloudInitSkippedLogMessage());
            return;
        }

        const desiredIpConfig = this.config.ipconfig0;
        const config = await this.vmUtils.getVMConfig(pveNode, pveVmid);
        if (!config) {
            await this.appendRunLog(jobId, "cloud-init", "warning", buildCloudInitConfigUnavailableLogMessage());
            return;
        }

        if (desiredIpConfig && config.ipconfig0 !== desiredIpConfig) {
            await this.appendRunLog(jobId, "cloud-init", "info", buildCloudInitApplyLogMessage(desiredIpConfig));
            await this.pveClient.request('PUT', pve_api.nodes_qemu_config(pveNode, pveVmid), { ipconfig0: desiredIpConfig });
        } else {
            await this.appendRunLog(jobId, "cloud-init", "info", buildCloudInitAlreadyConfiguredLogMessage(config.ipconfig0));
        }

        const regen = await this.vmUtils.regenerateCloudInit(pveNode, pveVmid);
        if (!regen.success) {
            await this.appendRunLog(jobId, "cloud-init", "warning", buildCloudInitRegenerationFailureLogMessage(regen.errorMessage));
            return;
        }

        if (regen.upid) {
            const wait = await this.vmUtils.waitForTaskCompletion(pveNode, regen.upid, "AI build cloud-init regeneration");
            if (!wait.success) {
                await this.appendRunLog(jobId, "cloud-init", "warning", buildCloudInitRegenerationTaskFailureLogMessage(wait.errorMessage));
                return;
            }
        }

        await this.appendRunLog(jobId, "cloud-init", "info", buildCloudInitRegeneratedLogMessage());
    }

    private async normalizeGuestNetworkIdentityAfterBoot(jobId: string, pveNode: string, pveVmid: string): Promise<void> {
        if (!this.config.normalizeGuestNetwork) {
            await this.appendRunLog(jobId, "network", "warning", buildGuestNetworkIdentitySkippedLogMessage());
            return;
        }

        await this.appendRunLog(jobId, "network", "info", buildGuestNetworkIdentityStartLogMessage());
        const result = await this.vmUtils.ensureUniqueGuestNetworkIdentity(
            pveNode,
            pveVmid,
            this.config.guestIdentityTimeoutMs
        );

        if (!result.success) {
            await this.appendRunLog(jobId, "network", "warning", buildGuestNetworkIdentityFailureLogMessage(result.errorMessage, result.stderr));
            return;
        }

        await this.appendRunLog(jobId, "network", "info", buildGuestNetworkIdentitySuccessLogMessage(result.stdout || ""));
    }

    private async waitForVMRecord(userId: string, pveNode: string, pveVmid: string): Promise<any | null> {
        for (let attempt = 0; attempt < this.config.vmRecordWaitAttempts; attempt++) {
            const vm = await this.vmRepository.findByOwnerAndPVE(userId, pveNode, pveVmid);
            if (vm) return vm;
            await this.sleep(this.config.vmRecordWaitMs);
        }
        return null;
    }

    private async waitForVMIP(jobId: string, pveNode: string, pveVmid: string): Promise<string> {
        for (let attempt = 1; attempt <= this.config.ipWaitAttempts; attempt++) {
            const networkInfo = await this.vmUtils.getVMNetworkInfo(pveNode, pveVmid);
            if (networkInfo.success && networkInfo.interfaces) {
                const ipAddresses = this.vmUtils.extractIPAddresses(networkInfo.interfaces);
                const preferred = selectPreferredVMIPAddress(ipAddresses);
                if (preferred) {
                    await this.appendRunLog(jobId, "network", "info", buildVMIPDetectedLogMessage(preferred));
                    return preferred;
                }
            }
            if (attempt % 6 === 0) {
                await this.appendRunLog(jobId, "network", "info", buildVMIPWaitLogMessage(attempt, this.config.ipWaitAttempts));
            }
            await this.sleep(this.config.ipWaitMs);
        }
        throw new Error("Timed out waiting for VM IP from QEMU guest agent");
    }

    private async setExecutionStatus(jobId: string, status: AIBoxBuildExecutionStatus, message: string): Promise<void> {
        await this.jobRepository.updateById(
            jobId,
            {
                execution_status: status,
                updated_at: new Date(),
                ...buildAIBoxRunLogPushUpdate(status, "info", message)
            }
        );
    }

    private async appendRunLog(jobId: string, stage: string, level: "info" | "warning" | "error", message: string): Promise<void> {
        await this.jobRepository.updateById(
            jobId,
            {
                updated_at: new Date(),
                ...buildAIBoxRunLogPushUpdate(stage, level, message)
            }
        );
    }
}

export const aiBoxBuildProvisioningService = new AIBoxBuildProvisioningService();
