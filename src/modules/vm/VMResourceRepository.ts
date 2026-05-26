import { UpdateResult } from "mongodb";
import { ComputeResourcePlan } from "../../interfaces/ComputeResourcePlan";
import { UsedComputeResource } from "../../interfaces/UesdComputeResource";
import { User } from "../../interfaces/User";
import { ComputeResourcePlanModel } from "../../orm/schemas/ComputeResourcePlanSchemas";
import { UsedComputeResourceModel } from "../../orm/schemas/UsedComputeResourceSchemas";
import { UsersModel } from "../../orm/schemas/UserSchemas";
import {
    buildAttachUsedComputeResourceUpdate,
    buildInitialUsedComputeResource
} from "./VMResourcePolicy";

type ExecQuery<T> = { exec(): Promise<T> };

type UserModelAdapter = {
    findById(id: string): ExecQuery<User | null>;
    updateOne(query: unknown, update: unknown): Promise<UpdateResult>;
};

type UsedComputeResourceModelAdapter = {
    findById(id: string): ExecQuery<UsedComputeResource | null>;
    create(payload: UsedComputeResource): Promise<UsedComputeResource & { _id?: unknown }>;
    updateOne(query: unknown, update: unknown): Promise<UpdateResult>;
};

type ComputeResourcePlanModelAdapter = {
    findOne(query: unknown): ExecQuery<ComputeResourcePlan | null>;
};

const defaultUserModelAdapter: UserModelAdapter = {
    findById: (id) => UsersModel.findById(id),
    updateOne: (query, update) => UsersModel.updateOne(query as any, update as any).exec()
};

const defaultUsedComputeResourceModelAdapter: UsedComputeResourceModelAdapter = {
    findById: (id) => UsedComputeResourceModel.findById(id),
    create: (payload) => UsedComputeResourceModel.create(payload),
    updateOne: (query, update) => UsedComputeResourceModel.updateOne(query as any, update as any).exec()
};

const defaultComputeResourcePlanModelAdapter: ComputeResourcePlanModelAdapter = {
    findOne: (query) => ComputeResourcePlanModel.findOne(query as any)
};

export class VMResourceRepository {
    constructor(
        private readonly usersModel: UserModelAdapter = defaultUserModelAdapter,
        private readonly usedResourceModel: UsedComputeResourceModelAdapter = defaultUsedComputeResourceModelAdapter,
        private readonly computeResourcePlanModel: ComputeResourcePlanModelAdapter = defaultComputeResourcePlanModelAdapter
    ) {}

    public async applyUsedResourceUpdateForUser(userId: string, update: unknown): Promise<boolean> {
        const user = await this.usersModel.findById(userId).exec();
        if (!user?.used_compute_resource_id) {
            return false;
        }

        await this.usedResourceModel.updateOne(
            { _id: user.used_compute_resource_id },
            update
        );
        return true;
    }

    public async getOrCreateUsedResources(user: User): Promise<UsedComputeResource | null> {
        let usedResources: UsedComputeResource | null = null;
        if (user.used_compute_resource_id) {
            usedResources = await this.usedResourceModel.findById(user.used_compute_resource_id).exec();
        }

        if (!usedResources) {
            usedResources = await this.usedResourceModel.create(buildInitialUsedComputeResource());
            await this.usersModel.updateOne(
                { _id: user._id },
                buildAttachUsedComputeResourceUpdate((usedResources as any)._id)
            );
        }

        return usedResources;
    }

    public async findComputeResourcePlan(planId: string): Promise<ComputeResourcePlan | null> {
        return this.computeResourcePlanModel.findOne({ _id: planId }).exec();
    }
}

export const vmResourceRepository = new VMResourceRepository();
