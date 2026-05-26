import { VMTemplateModel } from "../../orm/schemas/VM/VMTemplateSchemas";

type ExecQuery<T> = { exec(): Promise<T> };

type VMTemplateModelAdapter = {
    find(query: unknown): ExecQuery<any[]>;
    findById(id: string): ExecQuery<any | null>;
};

const defaultVMTemplateModelAdapter: VMTemplateModelAdapter = {
    find: (query) => VMTemplateModel.find(query as any),
    findById: (id) => VMTemplateModel.findById(id)
};

export class VMTemplateRepository {
    constructor(private readonly templateModel: VMTemplateModelAdapter = defaultVMTemplateModelAdapter) {}

    public async listByIds(templateIds: string[]): Promise<any[]> {
        if (templateIds.length === 0) return [];
        return this.templateModel.find({ _id: { $in: templateIds } }).exec();
    }

    public async findById(templateId: string): Promise<any | null> {
        return this.templateModel.findById(templateId).exec();
    }
}

export const vmTemplateRepository = new VMTemplateRepository();
