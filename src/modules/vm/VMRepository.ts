import { DeleteResult, UpdateResult } from "mongodb";
import { VMModel } from "../../orm/schemas/VM/VMSchemas";
import { UsersModel } from "../../orm/schemas/UserSchemas";
import {
    buildAttachOwnedVMUpdate,
    buildBoxVMMetadataUpdate,
    buildDetachOwnedVMUpdate,
    buildVMRecordCreatePayload
} from "./VMPersistencePolicy";

type ExecQuery<T> = { exec(): Promise<T> };

type VMModelAdapter = {
    create(payload: unknown): Promise<{ _id: any }>;
    findById(id: unknown): ExecQuery<any | null>;
    findOne(query: unknown): ExecQuery<any | null>;
    deleteOne(query: unknown): Promise<DeleteResult>;
    updateOne(query: unknown, update: unknown): Promise<UpdateResult>;
};

type UserModelAdapter = {
    updateOne(query: unknown, update: unknown): Promise<UpdateResult>;
};

const defaultVMModelAdapter: VMModelAdapter = {
    create: (payload) => VMModel.create(payload as any),
    findById: (id) => VMModel.findById(id as any),
    findOne: (query) => VMModel.findOne(query as any),
    deleteOne: (query) => VMModel.deleteOne(query as any).exec(),
    updateOne: (query, update) => VMModel.updateOne(query as any, update as any).exec()
};

const defaultUserModelAdapter: UserModelAdapter = {
    updateOne: (query, update) => UsersModel.updateOne(query as any, update as any).exec()
};

export class VMRepository {
    constructor(
        private readonly vmModel: VMModelAdapter = defaultVMModelAdapter,
        private readonly usersModel: UserModelAdapter = defaultUserModelAdapter
    ) {}

    public async createUserOwnedVM(input: {
        userId: string;
        pveVmid: string;
        pveNode: string;
        fromTemplateId?: string;
    }): Promise<string> {
        const newVM = await this.vmModel.create(buildVMRecordCreatePayload({
            pveVmid: input.pveVmid,
            pveNode: input.pveNode,
            ownerId: input.userId,
            fromTemplateId: input.fromTemplateId
        }));

        await this.usersModel.updateOne(
            { _id: input.userId },
            buildAttachOwnedVMUpdate(newVM._id)
        );

        return newVM._id.toString();
    }

    public async markAsBoxVM(vmId: string, boxId: string): Promise<UpdateResult> {
        return this.vmModel.updateOne(
            { _id: vmId },
            buildBoxVMMetadataUpdate(boxId)
        );
    }

    public async findById(vmId: string): Promise<any | null> {
        return this.vmModel.findById(vmId).exec();
    }

    public async findByPVE(pveVmid: string, pveNode: string): Promise<any | null> {
        return this.vmModel.findOne({
            pve_vmid: pveVmid,
            pve_node: pveNode
        }).exec();
    }

    public async findByOwnerAndPVE(ownerId: string, pveNode: string, pveVmid: string): Promise<any | null> {
        return this.vmModel.findOne({
            owner: ownerId,
            pve_node: pveNode,
            pve_vmid: pveVmid
        }).exec();
    }

    public async deleteVMRecord(vmId: string): Promise<DeleteResult> {
        return this.vmModel.deleteOne({ _id: vmId });
    }

    public async detachOwnedVM(userId: string, vmId: unknown): Promise<UpdateResult> {
        return this.usersModel.updateOne(
            { _id: userId },
            buildDetachOwnedVMUpdate(vmId)
        );
    }
}

export const vmRepository = new VMRepository();
