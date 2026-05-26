import { model, Schema } from "mongoose";
import { Reviews } from "../../interfaces/Reviews";

export const ReviewsSchemas = new Schema<Reviews>({
    reviewer_user_id: { type: String, required: true },
    rating_score: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: undefined },
    submitted_date: { type: Date, default: Date.now }
});

ReviewsSchemas.index({ reviewer_user_id: 1, submitted_date: -1 });
ReviewsSchemas.index({ rating_score: 1 });

export const ReviewsModel = model<Reviews>('reviews', ReviewsSchemas);
