import { ReviewsModel } from "../../orm/schemas/ReviewsSchemas";

type ExecQuery<T> = { exec(): Promise<T> };

type LeanableQuery<T> = {
    lean(): ExecQuery<T>;
    exec(): Promise<T>;
};

type ReviewModelAdapter = {
    createDocument(payload: unknown): any;
    find(query: unknown): LeanableQuery<any[]>;
    findOne(query: unknown): ExecQuery<any | null>;
    findById(id: string): ExecQuery<any | null>;
    findByIdAndDelete(id: string): ExecQuery<any | null>;
};

const defaultReviewModelAdapter: ReviewModelAdapter = {
    createDocument: (payload) => new ReviewsModel(payload),
    find: (query) => ReviewsModel.find(query as any),
    findOne: (query) => ReviewsModel.findOne(query as any),
    findById: (id) => ReviewsModel.findById(id),
    findByIdAndDelete: (id) => ReviewsModel.findByIdAndDelete(id)
};

export class ReviewRepository {
    constructor(private readonly reviewModel: ReviewModelAdapter = defaultReviewModelAdapter) {}

    public createReviewDocument(payload: unknown): any {
        return this.reviewModel.createDocument(payload);
    }

    public async findExistingInReviewIds(reviewIds: unknown[], reviewerUserId: string): Promise<any | null> {
        return this.reviewModel.findOne({
            _id: { $in: reviewIds },
            reviewer_user_id: reviewerUserId
        }).exec();
    }

    public async listByIds(reviewIds: unknown[], options: { lean?: boolean } = {}): Promise<any[]> {
        const query = this.reviewModel.find({ _id: { $in: reviewIds } });
        return options.lean ? query.lean().exec() : query.exec();
    }

    public async findById(reviewId: string): Promise<any | null> {
        return this.reviewModel.findById(reviewId).exec();
    }

    public async deleteById(reviewId: string): Promise<any | null> {
        return this.reviewModel.findByIdAndDelete(reviewId).exec();
    }
}

export const reviewRepository = new ReviewRepository();
