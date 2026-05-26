import { describe, expect, it } from "vitest";
import Roles from "../src/enum/role";
import { CourseMutationService } from "../src/modules/courses/CourseMutationService";

const courseId = "507f1f77bcf86cd799439091";
const userId = "507f1f77bcf86cd799439092";

const validCreateRequest = {
    course_name: "Web Security",
    course_subtitle: "Basics",
    course_description: "Learn web exploitation safely",
    duration_in_minutes: 90,
    difficulty: "Easy"
};

function makeUser(overrides: Record<string, unknown> = {}) {
    return {
        _id: userId,
        username: "teacher",
        email: "teacher@example.com",
        role: Roles.Admin,
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
    existingCourse?: any | null;
    updateUserResult?: any | null;
    updateCourseResult?: any | null;
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const savedCourse = { _id: courseId };
    const service = new CourseMutationService({
        idFactory: () => courseId,
        courseRepo: {
            findById: async (id, opts) => {
                calls.push({ method: "findById", args: [id, opts] });
                return options.course === undefined
                    ? { _id: courseId, submitter_user_id: userId, class_ids: ["class-1", "class-2"] }
                    : options.course;
            },
            findByName: async (name) => {
                calls.push({ method: "findByName", args: [name] });
                return options.existingCourse ?? null;
            },
            createCourseDocument: (payload) => {
                calls.push({ method: "createCourseDocument", args: [payload] });
                return {
                    save: async () => {
                        calls.push({ method: "save", args: [] });
                        return savedCourse;
                    }
                };
            },
            updateById: async (id, update, opts) => {
                calls.push({ method: "updateById", args: [id, update, opts] });
                return options.updateCourseResult ?? { _id: id };
            },
            deleteById: async (id) => {
                calls.push({ method: "deleteById", args: [id] });
                return { _id: id };
            }
        },
        userRepo: {
            updateCourseIds: async (id, courseIds) => {
                calls.push({ method: "updateCourseIds", args: [id, courseIds] });
                return Object.prototype.hasOwnProperty.call(options, "updateUserResult")
                    ? options.updateUserResult
                    : { _id: id };
            },
            removeCourseFromAllUsers: async (id) => {
                calls.push({ method: "removeCourseFromAllUsers", args: [id] });
                return { modifiedCount: 2 };
            }
        },
        classRepo: {
            listChapterRefsByIds: async (classIds) => {
                calls.push({ method: "listChapterRefsByIds", args: [classIds] });
                return [
                    { chapter_ids: ["chapter-1"] },
                    { chapter_ids: ["chapter-2", "chapter-3"] }
                ];
            },
            deleteByIds: async (classIds) => {
                calls.push({ method: "deleteClassesByIds", args: [classIds] });
                return { deletedCount: classIds.length };
            }
        },
        chapterRepo: {
            deleteByIds: async (chapterIds) => {
                calls.push({ method: "deleteChaptersByIds", args: [chapterIds] });
                return { deletedCount: chapterIds.length };
            }
        }
    });

    return { calls, service };
}

describe("CourseMutationService", () => {
    it("creates a course and associates it with the submitter", async () => {
        const { service, calls } = makeService();

        await expect(service.createCourse({
            user: makeUser({ course_ids: ["507f1f77bcf86cd799439099"] }),
            request: validCreateRequest
        })).resolves.toMatchObject({
            code: 200,
            message: "Course created successfully",
            body: { course_id: courseId }
        });

        expect(calls).toContainEqual({
            method: "updateCourseIds",
            args: [userId, ["507f1f77bcf86cd799439099", courseId]]
        });
    });

    it("rolls back course creation when submitter association fails", async () => {
        const { service, calls } = makeService({ updateUserResult: null });

        await expect(service.createCourse({
            user: makeUser(),
            request: validCreateRequest
        })).resolves.toMatchObject({
            code: 500,
            message: "Failed to associate course with user"
        });

        expect(calls).toContainEqual({ method: "deleteById", args: [courseId] });
    });

    it("updates only courses owned by the actor", async () => {
        const { service, calls } = makeService();

        await expect(service.updateCourse({
            user: makeUser(),
            courseId,
            request: { course_subtitle: "Updated subtitle" }
        })).resolves.toMatchObject({
            code: 200,
            message: "Course updated successfully",
            body: { course_id: courseId }
        });

        const updateCall = calls.find((call) => call.method === "updateById");
        expect(updateCall?.args[0]).toBe(courseId);
        expect(updateCall?.args[1]).toMatchObject({
            $set: {
                course_subtitle: "Updated subtitle",
                status: "編輯中",
                update_date: expect.any(Date)
            }
        });
        expect(updateCall?.args[2]).toEqual({ new: true });
    });

    it("rejects updates from non-owners", async () => {
        const { service, calls } = makeService({
            course: { _id: courseId, submitter_user_id: "507f1f77bcf86cd799439093" }
        });

        await expect(service.updateCourse({
            user: makeUser(),
            courseId,
            request: { course_subtitle: "Updated subtitle" }
        })).resolves.toMatchObject({
            code: 403,
            message: "You are not authorized to update this course"
        });
        expect(calls.some((call) => call.method === "updateById")).toBe(false);
    });

    it("deletes a course and cascades class/chapter membership cleanup", async () => {
        const { service, calls } = makeService();

        await expect(service.deleteCourse(courseId)).resolves.toMatchObject({
            code: 200,
            message: "Course and all its related classes and chapters deleted successfully"
        });

        expect(calls.map((call) => call.method)).toEqual([
            "findById",
            "listChapterRefsByIds",
            "deleteChaptersByIds",
            "deleteClassesByIds",
            "removeCourseFromAllUsers",
            "deleteById"
        ]);
    });
});
