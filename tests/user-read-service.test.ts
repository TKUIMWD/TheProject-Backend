import { describe, expect, it } from "vitest";
import Roles from "../src/enum/role";
import { UserReadService } from "../src/modules/users/UserReadService";

const userId = "507f1f77bcf86cd799439501";
const targetUserId = "507f1f77bcf86cd799439502";
const courseId = "507f1f77bcf86cd799439503";
const planId = "507f1f77bcf86cd799439504";
const updateDate = new Date("2026-05-26T12:00:00.000Z");

function makeUser(overrides: Record<string, unknown> = {}) {
    return {
        _id: userId,
        username: "alice",
        email: "alice@example.test",
        role: Roles.User,
        password_hash: "",
        isVerified: true,
        compute_resource_plan_id: planId,
        used_compute_resource_id: "",
        course_ids: [courseId],
        owned_vms: [],
        owned_templates: [],
        ...overrides
    } as any;
}

function makeService(options: {
    courses?: any[];
    crp?: any | null;
    targetUser?: any | null;
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const service = new UserReadService({
        courses: {
            listUserCourses: async (...args) => {
                calls.push({ method: "listUserCourses", args });
                return options.courses ?? [{
                    _id: courseId,
                    course_name: "Web Security",
                    course_subtitle: "Intro",
                    duration_in_minutes: 90,
                    difficulty: "easy",
                    rating: 4.5,
                    submitter_user_id: { username: "teacher" },
                    update_date: updateDate,
                    status: "公開"
                }];
            }
        },
        crps: {
            findById: async (...args) => {
                calls.push({ method: "findCRPById", args });
                return options.crp === undefined ? {
                    _id: planId,
                    name: "standard",
                    max_cpu_cores_per_vm: 2,
                    max_memory_per_vm: 2048,
                    max_storage_per_vm: 20,
                    max_cpu_cores_sum: 8,
                    max_memory_sum: 8192,
                    max_storage_sum: 100,
                    max_vms: 3
                } : options.crp;
            }
        },
        users: {
            findById: async (...args) => {
                calls.push({ method: "findUserById", args });
                return options.targetUser === undefined ? {
                    _id: targetUserId,
                    username: "bob",
                    email: "bob@example.test"
                } : options.targetUser;
            }
        },
        defaultAvatar: "/uploads/avatars/default-avatar.jpg"
    });

    return { calls, service };
}

describe("UserReadService", () => {
    it("returns joined course DTOs with teacher names", async () => {
        const { service, calls } = makeService();

        await expect(service.getUserCourses(makeUser())).resolves.toEqual({
            code: 200,
            message: "User courses retrieved successfully",
            body: [{
                _id: courseId,
                course_name: "Web Security",
                course_subtitle: "Intro",
                duration_in_minutes: 90,
                difficulty: "easy",
                rating: 4.5,
                teacher_name: "teacher",
                update_date: updateDate,
                status: "公開"
            }]
        });

        expect(calls).toContainEqual({
            method: "listUserCourses",
            args: [[courseId]]
        });
    });

    it("returns an empty course response when user has no courses", async () => {
        const { service } = makeService({ courses: [] });

        await expect(service.getUserCourses(makeUser({ course_ids: [] }))).resolves.toEqual({
            code: 200,
            message: "User has no courses",
            body: []
        });
    });

    it("blocks course and CRP reads for unverified users", async () => {
        const { service, calls } = makeService();

        await expect(service.getUserCourses(makeUser({ isVerified: false }))).resolves.toMatchObject({
            code: 403,
            message: "user is not verified"
        });
        await expect(service.getUserCRP(makeUser({ isVerified: false }))).resolves.toMatchObject({
            code: 403,
            message: "user is not verified"
        });

        expect(calls).toEqual([]);
    });

    it("returns the user's compute resource plan", async () => {
        const { service, calls } = makeService();

        await expect(service.getUserCRP(makeUser())).resolves.toMatchObject({
            code: 200,
            message: "User CRP retrieved successfully",
            body: {
                _id: planId,
                name: "standard"
            }
        });

        expect(calls).toContainEqual({
            method: "findCRPById",
            args: [planId]
        });
    });

    it("returns not found when the user's CRP is missing", async () => {
        const { service } = makeService({ crp: null });

        await expect(service.getUserCRP(makeUser())).resolves.toMatchObject({
            code: 404,
            message: "User CRP not found"
        });
    });

    it("returns a target user profile for verified SuperAdmin actors", async () => {
        const { service, calls } = makeService();

        await expect(service.getUserById({
            actor: makeUser({ role: Roles.SuperAdmin }),
            targetUserId
        })).resolves.toEqual({
            code: 200,
            message: "User retrieved successfully",
            body: {
                username: "bob",
                email: "bob@example.test",
                avatar_path: "/uploads/avatars/default-avatar.jpg"
            }
        });

        expect(calls).toContainEqual({
            method: "findUserById",
            args: [targetUserId]
        });
    });

    it("rejects invalid target user IDs before lookup", async () => {
        const { service, calls } = makeService();

        await expect(service.getUserById({
            actor: makeUser({ role: Roles.SuperAdmin }),
            targetUserId: "bad-id"
        })).resolves.toMatchObject({
            code: 400,
            message: "Invalid user_id format"
        });

        expect(calls).toEqual([]);
    });

    it("returns not found for missing target users", async () => {
        const { service } = makeService({ targetUser: null });

        await expect(service.getUserById({
            actor: makeUser({ role: Roles.SuperAdmin }),
            targetUserId
        })).resolves.toMatchObject({
            code: 404,
            message: "User not found"
        });
    });
});
