import { VM_Template } from "../../interfaces/VM/VM_Template";
import { VMBox, VMBoxModel } from "../../orm/schemas/VM/VMBoxSchemas";
import { VMTemplateModel } from "../../orm/schemas/VM/VMTemplateSchemas";

type ExecQuery<T> = { exec(): Promise<T> };

type VMTemplateModelAdapter = {
    findOne(query: unknown): ExecQuery<VM_Template | null>;
};

type VMBoxModelAdapter = {
    findById(id: string): ExecQuery<VMBox | null>;
};

const defaultVMTemplateModelAdapter: VMTemplateModelAdapter = {
    findOne: (query) => VMTemplateModel.findOne(query as any)
};

const defaultVMBoxModelAdapter: VMBoxModelAdapter = {
    findById: (id) => VMBoxModel.findById(id)
};

export class VMCreationSourceRepository {
    constructor(
        private readonly templateModel: VMTemplateModelAdapter = defaultVMTemplateModelAdapter,
        private readonly boxModel: VMBoxModelAdapter = defaultVMBoxModelAdapter
    ) {}

    public async findTemplateById(templateId: string): Promise<VM_Template | null> {
        return this.templateModel.findOne({ _id: templateId }).exec();
    }

    public async findBoxById(boxId: string): Promise<VMBox | null> {
        return this.boxModel.findById(boxId).exec();
    }
}

export const vmCreationSourceRepository = new VMCreationSourceRepository();
