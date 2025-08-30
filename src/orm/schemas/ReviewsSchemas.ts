import { model, Schema } from "mongoose";
import { Reviews } from "../../interfaces/Reviews";

export const ReviewsSchemas = new Schema<Reviews>({
    reviewer_user_id: { type: String, required: true },
    rating_score: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: undefined },
    submitted_date: { type: Date, default: Date.now }
});

export const ReviewsModel = model<Reviews>('reviews', ReviewsSchemas);
