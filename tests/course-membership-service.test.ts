import { describe, expect, it } from "vitest";
import Roles from "../src/enum/role";
import { CourseMembershipService } from "../src/modules/courses/CourseMembershipService";

const courseId = "507f1f77bcf86cd799439081";
const userId = "507f1f77bcf86cd799439082";
const ownerId = "507f1f77bcf86cd799439083";

function makeUser(overrides: Record<string, unknown> = {}) {
    return {
        _id: userId,
        username: "student",
        email: "student@example.com",
        role: Roles.User,
        course_ids: [],
        owned_vms: [],
        owned_templates: [],
        password_hash: "",
        isVerified: true,
        compute_resource_plan_id: "",
        used_compute_resource_id: "",
        ...overrides
    } as any;
}

function makeService(options: {
    course?: any | null;
    users?: any[];
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const service = new CourseMembershipService({
        courseRepo: {
            findById: async (id, opts) => {
                calls.push({ method: "findById", args: [id, opts] });
                return options.course ?? {
                    _id: courseId,
                    course_name: "Web Security",
                    submitter_user_id: ownerId,
                    status: "公開"
                };
            }
        },
        userRepo: {
            updateCourseIds: async (id, courseIds) => {
                calls.push({ method: "updateCourseIds", args: [id, courseIds] });
                return { _id: id };
            },
            listByEmails: async (emails, opts) => {
                calls.push({ method: "listByEmails", args: [emails, opts] });
                return options.users ?? [];
            }
        },
        invitationSender: async (email, courseName, id, inviter) => {
            calls.push({ method: "invitationSender", args: [email, courseName, id, inviter] });
        }
    });

    return { calls, service };
}

describe("CourseMembershipService", () => {
    it("adds a public course to the user's joined course ids", async () => {
        const { service, calls } = makeService();

        await expect(service.joinCourse({
            user: makeUser({ course_ids: ["507f1f77bcf86cd799439099"] }),
            courseId
        })).resolves.toMatchObject({
            code: 200,
            message: "Successfully joined the course"
        });

        expect(calls).toContainEqual({
            method: "updateCourseIds",
            args: [userId, ["507f1f77bcf86cd799439099", courseId]]
        });
    });

    it("rejects joining a non-public course", async () => {
        const { service, calls } = makeService({
            course: {
                _id: courseId,
                status: "未公開"
            }
        });

        await expect(service.joinCourse({
            user: makeUser(),
            courseId
        })).resolves.toMatchObject({
            code: 403,
            message: "You can only join courses that are publicly available"
        });
        expect(calls.some((call) => call.method === "updateCourseIds")).toBe(false);
    });

    it("sends invitations only to existing users who have not joined", async () => {
        const { service, calls } = makeService({
            users: [
                { email: "new@example.com", course_ids: [] },
                { email: "joined@example.com", course_ids: [courseId] }
            ]
        });

        await expect(service.inviteUsers({
            actor: makeUser({ _id: ownerId, username: "teacher", role: Roles.Admin }),
            request: {
                course_id: courseId,
                emails: ["NEW@example.com", "joined@example.com", "missing@example.com", "new@example.com"]
            }
        })).resolves.toMatchObject({
            code: 200,
            message: "Invitations sent"
        });

        expect(calls).toContainEqual({
            method: "listByEmails",
            args: [["new@example.com", "joined@example.com", "missing@example.com"], { lean: true }]
        });
        expect(calls.filter((call) => call.method === "invitationSender")).toEqual([
            {
                method: "invitationSender",
                args: ["new@example.com", "Web Security", courseId, "teacher"]
            }
        ]);
    });

    it("rejects invitations from non-owners", async () => {
        const { service, calls } = makeService();

        await expect(service.inviteUsers({
            actor: makeUser({ _id: "507f1f77bcf86cd799439084", role: Roles.Admin }),
            request: {
                course_id: courseId,
                emails: ["new@example.com"]
            }
        })).resolves.toMatchObject({
            code: 403,
            message: "You are not authorized to invite users to this course"
        });
        expect(calls.some((call) => call.method === "invitationSender")).toBe(false);
    });
});
