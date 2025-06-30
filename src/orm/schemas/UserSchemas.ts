import { model, Schema } from "mongoose";
import { User } from "../../interfaces/User";
import Roles from "../../enum/role";

export const UsersSchemas = new Schema<User>({
    username:{ type: String, required: true },
    password_hash:{ type: String, required: true },
    email:{ type: String, required: true },
    isVerified:{ type: Boolean, default: true },
    role:{ type: String , default: Roles.User },
    lastTimeVerifyEmailSent:{ type: Date },
    lastTimePasswordResetEmailSent:{ type: Date },
    isLocked:{ type: Boolean, default: false },
    registeredAt:{ type: Date},
    avatar_path:{ type: String },
    wrongLoginAttemptId:{ type: String },
    course_ids:{ type: [String], default: [] }
});

export const UsersModel = model<User>('users', UsersSchemas);
