import bcrypt from "bcrypt";
import { User, UserProfile } from "../../interfaces/User";
import { UsersModel } from "../../orm/schemas/UserSchemas";
import { DEFAULT_AVATAR, deleteAvatar, processAvatar } from "../../utils/avatarUpload";
import { generateHashedPassword, passwordStrengthCheck, PasswordStrengthCheckResult } from "../../utils/password";
import { createResponse, resp } from "../../utils/resp";

type UserProfileDocument = User & {
    save(): Promise<unknown>;
};

type UserProfileRepository = {
    usernameExists(username: string, excludeUserId: unknown): Promise<boolean>;
};

type UserProfilePasswordDeps = {
    comparePassword(candidate: string, hash: string): Promise<boolean>;
    strengthCheck(password: string): PasswordStrengthCheckResult;
    hashPassword(password: string): Promise<string>;
};

type UserProfileAvatarDeps = {
    defaultAvatar: string;
    processAvatar(file: Express.Multer.File): Promise<string>;
    deleteAvatar(avatarPath: string): void;
};

type UserProfileServiceDeps = {
    userRepo?: UserProfileRepository;
    password?: UserProfilePasswordDeps;
    avatar?: UserProfileAvatarDeps;
};

const defaultUserRepo: UserProfileRepository = {
    usernameExists: async (username, excludeUserId) => {
        const user = await UsersModel.findOne({ username, _id: { $ne: excludeUserId } }).exec();
        return Boolean(user);
    }
};

const defaultPasswordDeps: UserProfilePasswordDeps = {
    comparePassword: (candidate, hash) => bcrypt.compare(candidate, hash),
    strengthCheck: passwordStrengthCheck,
    hashPassword: generateHashedPassword
};

const defaultAvatarDeps: UserProfileAvatarDeps = {
    defaultAvatar: DEFAULT_AVATAR,
    processAvatar,
    deleteAvatar
};

export class UserProfileService {
    private readonly userRepo: UserProfileRepository;
    private readonly password: UserProfilePasswordDeps;
    private readonly avatar: UserProfileAvatarDeps;

    constructor(deps: UserProfileServiceDeps = {}) {
        this.userRepo = deps.userRepo ?? defaultUserRepo;
        this.password = deps.password ?? defaultPasswordDeps;
        this.avatar = deps.avatar ?? defaultAvatarDeps;
    }

    public getProfile(user: UserProfileDocument): resp<UserProfile | undefined> {
        if (!user.isVerified) {
            return createResponse(403, "user is not verified");
        }

        return createResponse(200, "Profile retrieved successfully", this.buildProfile(user));
    }

    public async updateProfile(input: {
        user: UserProfileDocument;
        body: Record<string, unknown>;
    }): Promise<resp<UserProfile | undefined>> {
        const username = input.body.username;
        if (!username) {
            return createResponse(400, "missing required field: username");
        }

        if (await this.userRepo.usernameExists(String(username), input.user._id)) {
            return createResponse(400, "unable to update profile");
        }

        input.user.username = String(username);
        await input.user.save();

        return createResponse(200, "Profile updated successfully", this.buildProfile(input.user));
    }

    public async changePassword(input: {
        user: UserProfileDocument;
        body: Record<string, unknown>;
    }): Promise<resp<undefined>> {
        const user = input.user;
        if (!user.isVerified) {
            return createResponse(403, "user is not verified");
        }

        const { oldPassword, newPassword, confirmPassword } = input.body;
        if (!oldPassword || !newPassword || !confirmPassword) {
            const missingFields = [];
            if (!oldPassword) missingFields.push("oldPassword");
            if (!newPassword) missingFields.push("newPassword");
            if (!confirmPassword) missingFields.push("confirmPassword");
            return createResponse(400, `missing required fields: ${missingFields.join(", ")}`);
        }

        if (newPassword !== confirmPassword) {
            return createResponse(400, "newPassword and confirmPassword do not match");
        }

        const isMatch = await this.password.comparePassword(String(oldPassword), user.password_hash);
        if (!isMatch) {
            return createResponse(400, "oldPassword is incorrect");
        }

        const passwordStrengthCheckResult = this.password.strengthCheck(String(newPassword));
        if (!passwordStrengthCheckResult.isValid) {
            return createResponse(400, `password does not meet the requirements: ${passwordStrengthCheckResult.missingRequirements.join(", ")}`);
        }

        user.password_hash = await this.password.hashPassword(String(newPassword));
        await user.save();

        return createResponse(200, "Password changed successfully");
    }

    public async uploadAvatar(input: {
        user: UserProfileDocument;
        file?: Express.Multer.File;
    }): Promise<resp<UserProfile | undefined>> {
        const user = input.user;
        if (!user.isVerified) {
            return createResponse(403, "user is not verified");
        }

        if (!input.file) {
            return createResponse(400, "no file uploaded");
        }

        if (user.avatar_path && user.avatar_path !== this.avatar.defaultAvatar) {
            this.avatar.deleteAvatar(user.avatar_path);
        }

        user.avatar_path = await this.avatar.processAvatar(input.file);
        await user.save();

        return createResponse(200, "Avatar uploaded successfully", this.buildProfile(user));
    }

    public async deleteAvatar(input: {
        user: UserProfileDocument;
    }): Promise<resp<UserProfile | undefined>> {
        const user = input.user;
        if (!user.isVerified) {
            return createResponse(403, "user is not verified");
        }

        if (!user.avatar_path || user.avatar_path === this.avatar.defaultAvatar) {
            return createResponse(400, "no custom avatar to delete");
        }

        this.avatar.deleteAvatar(user.avatar_path);
        user.avatar_path = this.avatar.defaultAvatar;
        await user.save();

        return createResponse(200, "Avatar deleted successfully", this.buildProfile(user));
    }

    private buildProfile(user: User): UserProfile {
        return {
            username: user.username,
            email: user.email,
            avatar_path: user.avatar_path || this.avatar.defaultAvatar
        };
    }
}

export const userProfileService = new UserProfileService();
