import { describe, expect, it } from "vitest";
import { ClassManagementService } from "../src/modules/courses/ClassManagementService";

const courseId = "507f1f77bcf86cd799439101";
const classId = "507f1f77bcf86cd799439102";
const ownerId = "507f1f77bcf86cd799439103";
const otherUserId = "507f1f77bcf86cd799439104";

function makeUser(overrides: Record<string, unknown> = {}) {
    return {
        _id: ownerId,
        username: "teacher",
        email: "teacher@example.test",
        role: "admin",
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

function makeCourse(overrides: Record<string, unknown> = {}) {
    return {
        _id: courseId,
        submitter_user_id: ownerId,
        class_ids: [classId],
        ...overrides
    };
}

function makeClass(overrides: Record<string, unknown> = {}) {
    return {
        _id: classId,
        course_id: courseId,
        class_name: "Intro",
        class_subtitle: "Basics",
        class_order: 0,
        chapter_ids: ["chapter-1", "chapter-2"],
        ...overrides
    };
}

function makeService(options: {
    classDoc?: any | null;
    course?: any | null;
    existingNameClass?: any | null;
    existingOrderClasses?: any[];
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const service = new ClassManagementService({
        classRepo: {
            findById: async (...args) => {
                calls.push({ method: "findClassById", args });
                return options.classDoc === undefined ? makeClass() : options.classDoc;
            },
            findOneLean: async (...args) => {
                calls.push({ method: "findOneClassLean", args });
                return options.existingNameClass ?? null;
            },
            listLean: async (...args) => {
                calls.push({ method: "listClassesLean", args });
                return options.existingOrderClasses ?? [];
            },
            create: async (payload) => {
                calls.push({ method: "createClass", args: [payload] });
                return { _id: "new-class-1", ...payload };
            },
            updateById: async (...args) => {
                calls.push({ method: "updateClassById", args });
            },
            deleteById: async (...args) => {
                calls.push({ method: "deleteClassById", args });
            }
        },
        courseRepo: {
            findById: async (...args) => {
                calls.push({ method: "findCourseById", args });
                return options.course === undefined ? makeCourse() : options.course;
            },
            pullClassId: async (...args) => {
                calls.push({ method: "pullClassId", args });
            },
            pushClassId: async (...args) => {
                calls.push({ method: "pushClassId", args });
            }
        },
        chapterRepo: {
            deleteByIds: async (...args) => {
                calls.push({ method: "deleteChaptersByIds", args });
            }
        }
    });

    return { calls, service };
}

describe("ClassManagementService", () => {
    it("returns a class when the requester owns the course", async () => {
        const { service } = makeService();

        await expect(service.getClassById({
            user: makeUser(),
            classId
        })).resolves.toMatchObject({
            code: 200,
            message: "success",
            body: {
                classData: {
                    _id: classId
                }
            }
        });
    });

    it("rejects invalid class IDs before repository lookup", async () => {
        const { service, calls } = makeService();

        await expect(service.getClassById({
            user: makeUser(),
            classId: "bad-id"
        })).resolves.toMatchObject({
            code: 400,
            message: "Invalid class_id format"
        });

        expect(calls).toEqual([]);
    });

    it("updates a class after validating ownership and duplicate names", async () => {
        const { service, calls } = makeService();

        await expect(service.updateClassById({
            user: makeUser(),
            classId,
            body: {
                class_name: "Advanced",
                class_subtitle: "Deep dive",
                class_order: 1
            }
        })).resolves.toMatchObject({
            code: 200,
            message: "Update class successfully"
        });

        expect(calls).toContainEqual({
            method: "findOneClassLean",
            args: [{
                course_id: courseId,
                class_name: "Advanced",
                _id: { $ne: classId }
            }]
        });
        expect(calls).toContainEqual({
            method: "updateClassById",
            args: [classId, {
                class_name: "Advanced",
                class_subtitle: "Deep dive",
                class_order: 1
            }]
        });
    });

    it("blocks class updates from non-owners", async () => {
        const { service, calls } = makeService();

        await expect(service.updateClassById({
            user: makeUser({ _id: otherUserId }),
            classId,
            body: {
                class_name: "Advanced"
            }
        })).resolves.toMatchObject({
            code: 403,
            message: "You are not authorized to update this class"
        });

        expect(calls.map((call) => call.method)).not.toContain("updateClassById");
    });

    it("rejects duplicate class names during update", async () => {
        const { service, calls } = makeService({
            existingNameClass: makeClass({ _id: "existing-class" })
        });

        await expect(service.updateClassById({
            user: makeUser(),
            classId,
            body: {
                class_name: "Advanced"
            }
        })).resolves.toMatchObject({
            code: 400,
            message: "Class with this name already exists in the course"
        });

        expect(calls.map((call) => call.method)).not.toContain("updateClassById");
    });

    it("deletes a class, detaches it from the course, and deletes child chapters", async () => {
        const { service, calls } = makeService();

        await expect(service.deleteClassById({
            user: makeUser(),
            classId
        })).resolves.toMatchObject({
            code: 200,
            message: "Delete class successfully"
        });

        expect(calls).toContainEqual({
            method: "pullClassId",
            args: [courseId, classId]
        });
        expect(calls).toContainEqual({
            method: "deleteChaptersByIds",
            args: [["chapter-1", "chapter-2"]]
        });
        expect(calls).toContainEqual({
            method: "deleteClassById",
            args: [classId]
        });
    });

    it("adds a class to a course and attaches the class ID", async () => {
        const { service, calls } = makeService();

        await expect(service.addClassToCourse({
            user: makeUser(),
            courseId,
            body: {
                class_name: "New Class",
                class_subtitle: "New subtitle",
                class_order: 2
            }
        })).resolves.toEqual({
            code: 200,
            message: "Class added successfully",
            body: { class_id: "new-class-1" }
        });

        expect(calls).toContainEqual({
            method: "createClass",
            args: [{
                course_id: courseId,
                class_name: "New Class",
                class_subtitle: "New subtitle",
                class_order: 2,
                chapter_ids: []
            }]
        });
        expect(calls).toContainEqual({
            method: "pushClassId",
            args: [courseId, "new-class-1"]
        });
    });

    it("rejects duplicate class order during add", async () => {
        const { service, calls } = makeService({
            existingOrderClasses: [makeClass({ class_order: 2 })]
        });

        await expect(service.addClassToCourse({
            user: makeUser(),
            courseId,
            body: {
                class_name: "New Class",
                class_subtitle: "New subtitle",
                class_order: 2
            }
        })).resolves.toMatchObject({
            code: 400,
            message: "A class with the same order already exists in this course"
        });

        expect(calls.map((call) => call.method)).not.toContain("createClass");
        expect(calls.map((call) => call.method)).not.toContain("pushClassId");
    });
});
