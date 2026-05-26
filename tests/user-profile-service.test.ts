import { describe, expect, it } from "vitest";
import Roles from "../src/enum/role";
import { UserProfileService } from "../src/modules/users/UserProfileService";

const userId = "507f1f77bcf86cd799439301";

function makeUser(overrides: Record<string, unknown> = {}) {
    const saves: unknown[] = [];
    const user = {
        _id: userId,
        username: "alice",
        email: "alice@example.test",
        password_hash: "old-hash",
        isVerified: true,
        role: Roles.User,
        avatar_path: undefined,
        compute_resource_plan_id: "",
        used_compute_resource_id: "",
        course_ids: [],
        owned_vms: [],
        owned_templates: [],
        save: async () => {
            saves.push({ username: user.username, password_hash: user.password_hash, avatar_path: user.avatar_path });
        },
        ...overrides
    } as any;

    return { saves, user };
}

function makeService(options: {
    usernameExists?: boolean;
    passwordMatches?: boolean;
    strength?: { isValid: boolean; missingRequirements: string[] };
    hash?: string;
    processedAvatar?: string;
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const service = new UserProfileService({
        userRepo: {
            usernameExists: async (...args) => {
                calls.push({ method: "usernameExists", args });
                return options.usernameExists ?? false;
            }
        },
        password: {
            comparePassword: async (...args) => {
                calls.push({ method: "comparePassword", args });
                return options.passwordMatches ?? true;
            },
            strengthCheck: (...args) => {
                calls.push({ method: "strengthCheck", args });
                return options.strength ?? { isValid: true, missingRequirements: [] };
            },
            hashPassword: async (...args) => {
                calls.push({ method: "hashPassword", args });
                return options.hash ?? "new-hash";
            }
        },
        avatar: {
            defaultAvatar: "/uploads/avatars/default-avatar.jpg",
            processAvatar: async (...args) => {
                calls.push({ method: "processAvatar", args });
                return options.processedAvatar ?? "/uploads/avatars/new.jpg";
            },
            deleteAvatar: (...args) => {
                calls.push({ method: "deleteAvatar", args });
            }
        }
    });

    return { calls, service };
}

describe("UserProfileService", () => {
    it("returns a verified user's profile with default avatar fallback", () => {
        const { user } = makeUser();
        const { service } = makeService();

        expect(service.getProfile(user)).toEqual({
            code: 200,
            message: "Profile retrieved successfully",
            body: {
                username: "alice",
                email: "alice@example.test",
                avatar_path: "/uploads/avatars/default-avatar.jpg"
            }
        });
    });

    it("blocks profile reads for unverified users", () => {
        const { user } = makeUser({ isVerified: false });
        const { service } = makeService();

        expect(service.getProfile(user)).toMatchObject({
            code: 403,
            message: "user is not verified"
        });
    });

    it("updates username when it is unique", async () => {
        const { user, saves } = makeUser();
        const { service, calls } = makeService();

        await expect(service.updateProfile({
            user,
            body: { username: "bob" }
        })).resolves.toMatchObject({
            code: 200,
            message: "Profile updated successfully",
            body: {
                username: "bob"
            }
        });

        expect(calls).toContainEqual({
            method: "usernameExists",
            args: ["bob", userId]
        });
        expect(saves).toHaveLength(1);
    });

    it("rejects duplicate usernames without saving", async () => {
        const { user, saves } = makeUser();
        const { service } = makeService({ usernameExists: true });

        await expect(service.updateProfile({
            user,
            body: { username: "bob" }
        })).resolves.toMatchObject({
            code: 400,
            message: "unable to update profile"
        });

        expect(saves).toHaveLength(0);
    });

    it("changes password after old password and strength checks", async () => {
        const { user, saves } = makeUser();
        const { service, calls } = makeService({ hash: "hashed-new-password" });

        await expect(service.changePassword({
            user,
            body: {
                oldPassword: "OldPass1!",
                newPassword: "NewPass1!",
                confirmPassword: "NewPass1!"
            }
        })).resolves.toEqual({
            code: 200,
            message: "Password changed successfully",
            body: undefined
        });

        expect(calls.map((call) => call.method)).toEqual([
            "comparePassword",
            "strengthCheck",
            "hashPassword"
        ]);
        expect(user.password_hash).toBe("hashed-new-password");
        expect(saves).toHaveLength(1);
    });

    it("rejects missing password fields before compare", async () => {
        const { user } = makeUser();
        const { service, calls } = makeService();

        await expect(service.changePassword({
            user,
            body: {
                oldPassword: "old"
            }
        })).resolves.toMatchObject({
            code: 400,
            message: "missing required fields: newPassword, confirmPassword"
        });

        expect(calls).toEqual([]);
    });

    it("rejects weak passwords without hashing", async () => {
        const { user } = makeUser();
        const { service, calls } = makeService({
            strength: { isValid: false, missingRequirements: ["至少需要8個字元"] }
        });

        await expect(service.changePassword({
            user,
            body: {
                oldPassword: "OldPass1!",
                newPassword: "short",
                confirmPassword: "short"
            }
        })).resolves.toMatchObject({
            code: 400,
            message: "password does not meet the requirements: 至少需要8個字元"
        });

        expect(calls.map((call) => call.method)).not.toContain("hashPassword");
    });

    it("uploads an avatar and deletes the previous custom avatar", async () => {
        const { user, saves } = makeUser({ avatar_path: "/uploads/avatars/old.jpg" });
        const { service, calls } = makeService();
        const file = { originalname: "avatar.png" } as Express.Multer.File;

        await expect(service.uploadAvatar({
            user,
            file
        })).resolves.toMatchObject({
            code: 200,
            message: "Avatar uploaded successfully",
            body: {
                avatar_path: "/uploads/avatars/new.jpg"
            }
        });

        expect(calls).toContainEqual({
            method: "deleteAvatar",
            args: ["/uploads/avatars/old.jpg"]
        });
        expect(calls).toContainEqual({
            method: "processAvatar",
            args: [file]
        });
        expect(saves).toHaveLength(1);
    });

    it("rejects avatar upload without a file", async () => {
        const { user } = makeUser();
        const { service, calls } = makeService();

        await expect(service.uploadAvatar({ user })).resolves.toMatchObject({
            code: 400,
            message: "no file uploaded"
        });

        expect(calls).toEqual([]);
    });

    it("deletes a custom avatar and restores the default", async () => {
        const { user, saves } = makeUser({ avatar_path: "/uploads/avatars/custom.jpg" });
        const { service, calls } = makeService();

        await expect(service.deleteAvatar({ user })).resolves.toMatchObject({
            code: 200,
            message: "Avatar deleted successfully",
            body: {
                avatar_path: "/uploads/avatars/default-avatar.jpg"
            }
        });

        expect(calls).toContainEqual({
            method: "deleteAvatar",
            args: ["/uploads/avatars/custom.jpg"]
        });
        expect(saves).toHaveLength(1);
    });

    it("rejects deleting the default avatar", async () => {
        const { user } = makeUser({ avatar_path: "/uploads/avatars/default-avatar.jpg" });
        const { service, calls } = makeService();

        await expect(service.deleteAvatar({ user })).resolves.toMatchObject({
            code: 400,
            message: "no custom avatar to delete"
        });

        expect(calls).toEqual([]);
    });
});
