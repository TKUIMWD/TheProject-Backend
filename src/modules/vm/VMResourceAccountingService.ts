import { ComputeResourcePlan } from "../../interfaces/ComputeResourcePlan";
import { resp, createResponse } from "../../utils/resp";
import { UsedComputeResource } from "../../interfaces/UesdComputeResource";
import { User } from "../../interfaces/User";
import { VMConfig } from "../../interfaces/VM/VM";
import { logger } from "../../middlewares/log";
import { PVEUtils } from "../../utils/PVEUtils";
import {
    buildVMResourceReclaimUpdate,
    buildVMResourceUsageIncrementUpdate,
    checkVMCreateResourcePolicy,
    checkVMUpdateResourcePolicy
} from "./VMResourcePolicy";
import { vmResourceRepository } from "./VMResourceRepository";

type VMResourceRepositoryPort = {
    applyUsedResourceUpdateForUser(userId: string, update: unknown): Promise<boolean>;
    getOrCreateUsedResources(user: User): Promise<UsedComputeResource | null>;
    findComputeResourcePlan(planId: string): Promise<ComputeResourcePlan | null>;
};

export class VMResourceAccountingService {
    constructor(private readonly resourceRepository: VMResourceRepositoryPort = vmResourceRepository) {}

    public async incrementUsage(userId: string, cpuCores: number, memorySize: number, diskSize: number): Promise<void> {
        try {
            const updated = await this.resourceRepository.applyUsedResourceUpdateForUser(
                userId,
                buildVMResourceUsageIncrementUpdate({ cpuCores, memorySize, diskSize })
            );
            if (!updated) {
                logger.error(`User ${userId} not found or no used compute resource ID`);
                return;
            }
        } catch (error) {
            logger.error(`Error updating used compute resources for user ${userId}:`, error);
        }
    }

    public async reclaimWithConfig(userId: string, vmConfig: VMConfig): Promise<void> {
        try {
            const diskSize = PVEUtils.extractDiskSizeFromConfig(vmConfig.scsi0);
            const updated = await this.resourceRepository.applyUsedResourceUpdateForUser(
                userId,
                buildVMResourceReclaimUpdate({
                    cpuCores: vmConfig.cores,
                    memorySize: vmConfig.memory,
                    diskSize
                })
            );
            if (!updated) {
                logger.error(`User ${userId} not found or no used compute resource ID`);
                return;
            }

            logger.info(`Successfully reclaimed resources for user ${userId}: CPU=${vmConfig.cores}, Memory=${vmConfig.memory}MB, Disk=${diskSize}GB`);
        } catch (error) {
            logger.error(`Error reclaiming resources for user ${userId}:`, error);
            throw error;
        }
    }

    public async checkCreateLimits(user: User, cpuCores: number, memorySize: number, diskSize: number): Promise<resp<any>> {
        const computeResourcePlan = await this.resourceRepository.findComputeResourcePlan(user.compute_resource_plan_id);
        if (!computeResourcePlan) {
            return createResponse(404, "Compute resource plan not found");
        }

        const usedResourcesResp = await this.getOrCreateUsedResources(user);
        if (usedResourcesResp.code !== 200 || !usedResourcesResp.body) {
            return usedResourcesResp;
        }

        const policyResult = checkVMCreateResourcePolicy(computeResourcePlan, usedResourcesResp.body, {
            cpuCores,
            memorySize,
            diskSize
        });
        if (!policyResult.allowed) {
            return createResponse(400, policyResult.message);
        }

        return createResponse(200, policyResult.message);
    }

    public async checkUpdateLimits(input: {
        user: User;
        cpuDelta: number;
        memoryDelta: number;
        diskDelta: number;
        newCpuCores: number;
        newMemorySize: number;
        newDiskSize: number;
    }): Promise<resp<any>> {
        const computeResourcePlan = await this.resourceRepository.findComputeResourcePlan(input.user.compute_resource_plan_id);
        if (!computeResourcePlan) {
            return createResponse(404, "Compute resource plan not found");
        }

        const usedResourcesResp = await this.getOrCreateUsedResources(input.user);
        if (usedResourcesResp.code !== 200 || !usedResourcesResp.body) {
            return usedResourcesResp;
        }

        const policyResult = checkVMUpdateResourcePolicy(computeResourcePlan, usedResourcesResp.body, {
            cpuDelta: input.cpuDelta,
            memoryDelta: input.memoryDelta,
            diskDelta: input.diskDelta,
            newCpuCores: input.newCpuCores,
            newMemorySize: input.newMemorySize,
            newDiskSize: input.newDiskSize
        });
        if (!policyResult.allowed) {
            return createResponse(400, policyResult.message);
        }

        return createResponse(200, policyResult.message);
    }

    private async getOrCreateUsedResources(user: User): Promise<resp<UsedComputeResource | undefined>> {
        const usedResources = await this.resourceRepository.getOrCreateUsedResources(user);
        if (!usedResources) {
            return createResponse(404, "Used compute resources not found for user");
        }

        return createResponse(200, "Used compute resources ready", usedResources);
    }
}

export const vmResourceAccountingService = new VMResourceAccountingService();
