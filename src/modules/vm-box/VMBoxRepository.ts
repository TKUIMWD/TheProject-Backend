import { VMBox, VMBoxModel } from "../../orm/schemas/VM/VMBoxSchemas";

type ExecQuery<T> = { exec(): Promise<T> };

type VMBoxModelAdapter = {
    createDocument(payload: unknown): any;
    find(query: unknown): ExecQuery<any[]>;
    findOne(query: unknown): ExecQuery<any | null>;
    findById(id: string): ExecQuery<VMBox | null>;
};

const defaultVMBoxModelAdapter: VMBoxModelAdapter = {
    createDocument: (payload) => new VMBoxModel(payload),
    find: (query) => VMBoxModel.find(query as any),
    findOne: (query) => VMBoxModel.findOne(query as any),
    findById: (id) => VMBoxModel.findById(id)
};

function normalizeId(value: unknown): string | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value === "string") return value;
    if (typeof (value as any).toString === "function") return (value as any).toString();
    return undefined;
}

function collectUnique(items: any[], field: string): string[] {
    return Array.from(new Set(
        items
            .map((item) => normalizeId(item?.[field]))
            .filter((value): value is string => Boolean(value))
    ));
}

export class VMBoxRepository {
    constructor(private readonly boxModel: VMBoxModelAdapter = defaultVMBoxModelAdapter) {}

    public createBoxDocument(payload: unknown): any {
        return this.boxModel.createDocument(payload);
    }

    public async findById(boxId: string): Promise<VMBox | null> {
        return this.boxModel.findById(boxId).exec();
    }

    public async listByIds(boxIds: string[]): Promise<any[]> {
        if (boxIds.length === 0) return [];
        return this.boxModel.find({ _id: { $in: boxIds } }).exec();
    }

    public async listPublicBoxes(): Promise<any[]> {
        return this.boxModel.find({ is_public: true }).exec();
    }

    public async listOwnedBoxIds(submitterUserId: string): Promise<string[]> {
        const boxes = await this.boxModel.find({ submitter_user_id: submitterUserId }).exec();
        return boxes
            .map((box) => normalizeId(box?._id))
            .filter((boxId): boxId is string => Boolean(boxId));
    }

    public async findPublishedForSubmission(submission: any): Promise<any | null> {
        const submissionId = normalizeId(submission?._id);
        if (!submissionId) return null;

        const linkedBox = await this.boxModel.findOne({ submitted_box_id: submissionId }).exec();
        if (linkedBox) return linkedBox;

        return this.boxModel.findOne({
            vmtemplate_id: submission.vmtemplate_id,
            submitter_user_id: submission.submitter_user_id,
            submitted_date: submission.submitted_date,
            is_public: true
        }).exec();
    }

    public async listPublishedForSubmissions(submissions: any[]): Promise<any[]> {
        if (submissions.length === 0) return [];

        const submittedDates = submissions
            .map((submission) => submission?.submitted_date)
            .filter((submittedDate) => submittedDate !== undefined && submittedDate !== null);

        return this.boxModel.find({
            $or: [
                { submitted_box_id: { $in: collectUnique(submissions, "_id") } },
                {
                    is_public: true,
                    vmtemplate_id: { $in: collectUnique(submissions, "vmtemplate_id") },
                    submitter_user_id: { $in: collectUnique(submissions, "submitter_user_id") },
                    submitted_date: { $in: submittedDates }
                }
            ]
        }).exec();
    }
}

export const vmBoxRepository = new VMBoxRepository();
