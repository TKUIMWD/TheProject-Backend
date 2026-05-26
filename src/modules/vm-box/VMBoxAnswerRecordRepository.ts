import { AnswerRecords } from "../../interfaces/AnswerRecords";
import { AnswerRecordModel } from "../../orm/schemas/VM/AnswerRecordSchemas";

type AnswerRecordModelAdapter = {
    findById(id: string, options?: { lean?: boolean }): Promise<any | null>;
    create(payload: AnswerRecords): Promise<any>;
};

const defaultAnswerRecordModelAdapter: AnswerRecordModelAdapter = {
    findById: (id, options = {}) => {
        const query = AnswerRecordModel.findById(id);
        return options.lean ? query.lean().exec() : query.exec();
    },
    create: (payload) => AnswerRecordModel.create(payload)
};

export class VMBoxAnswerRecordRepository {
    constructor(private readonly answerRecordModel: AnswerRecordModelAdapter = defaultAnswerRecordModelAdapter) {}

    public async getOrCreateForVM(vm: any, options: { lean?: boolean } = {}): Promise<any> {
        let answerDoc: any = null;
        if (vm.answer_record) {
            try {
                answerDoc = await this.answerRecordModel.findById(vm.answer_record, options);
            } catch (error) {
                answerDoc = null;
            }
        }

        if (!answerDoc) {
            const created: any = await this.answerRecordModel.create({});
            vm.answer_record = created._id.toString();
            await vm.save();
            answerDoc = options.lean && typeof created.toObject === "function"
                ? created.toObject()
                : created;
        }

        return answerDoc;
    }
}

export const vmBoxAnswerRecordRepository = new VMBoxAnswerRecordRepository();
