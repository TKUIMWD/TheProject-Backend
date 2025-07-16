import { model, Schema } from "mongoose";
import { WrongLoginAttempt } from "../../interfaces/WrongLoginAttempt";

export const WrongLoginAttemptSchemas = new Schema<WrongLoginAttempt>({
    user_id: { type: String, required: true },
    wrongLoginAttemptStartTime: { type: Date, default: null },
    wrongLoginAttemptCount: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
});

export const WrongLoginAttemptModel = model<WrongLoginAttempt>('wrongLoginAttempts', WrongLoginAttemptSchemas);
