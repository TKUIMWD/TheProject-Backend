import { describe, expect, it } from "vitest";
import Roles from "../src/enum/role";
import { ChapterManagementService } from "../src/modules/courses/ChapterManagementService";

const courseId = "507f1f77bcf86cd799439201";
const classId = "507f1f77bcf86cd799439202";
const chapterId = "507f1f77bcf86cd799439203";
const ownerId = "507f1f77bcf86cd799439204";
const studentId = "507f1f77bcf86cd799439205";

function makeUser(overrides: Record<string, unknown> = {}) {
    return {
        _id: studentId,
        username: "student",
        email: "student@example.test",
        role: Roles.User,
        course_ids: [courseId],
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
        course_name: "Web Security",
        submitter_user_id: ownerId,
        ...overrides
    };
}

function makeClass(overrides: Record<string, unknown> = {}) {
    return {
        _id: classId,
        course_id: courseId,
        class_name: "Intro",
        chapter_ids: [chapterId],
        ...overrides
    };
}

function makeChapter(overrides: Record<string, unknown> = {}) {
    return {
        _id: chapterId,
        course_id: courseId,
        class_id: classId,
        chapter_name: "Recon",
        chapter_subtitle: "Enumeration",
        chapter_order: 1,
        has_approved_content: "approved",
        waiting_for_approve_content: "draft",
        saved_content: "saved",
        template_id: "template-1",
        ...overrides
    };
}

function makeService(options: {
    chapter?: any | null;
    classDoc?: any | null;
    course?: any | null;
    existingNameChapter?: any | null;
    existingOrderChapters?: any[];
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const service = new ChapterManagementService({
        chapterRepo: {
            findById: async (...args) => {
                calls.push({ method: "findChapterById", args });
                return options.chapter === undefined ? makeChapter() : options.chapter;
            },
            findOneLean: async (...args) => {
                calls.push({ method: "findOneChapterLean", args });
                return options.existingNameChapter ?? null;
            },
            listLean: async (...args) => {
                calls.push({ method: "listChaptersLean", args });
                return options.existingOrderChapters ?? [];
            },
            create: async (payload) => {
                calls.push({ method: "createChapter", args: [payload] });
                return { _id: "new-chapter-1", ...payload };
            },
            updateById: async (...args) => {
                calls.push({ method: "updateChapterById", args });
            },
            deleteById: async (...args) => {
                calls.push({ method: "deleteChapterById", args });
            }
        },
        classRepo: {
            findById: async (...args) => {
                calls.push({ method: "findClassById", args });
                return options.classDoc === undefined ? makeClass() : options.classDoc;
            },
            pushChapterId: async (...args) => {
                calls.push({ method: "pushChapterId", args });
            },
            pullChapterId: async (...args) => {
                calls.push({ method: "pullChapterId", args });
            }
        },
        courseRepo: {
            findById: async (...args) => {
                calls.push({ method: "findCourseById", args });
                return options.course === undefined ? makeCourse() : options.course;
            }
        }
    });

    return { calls, service };
}

describe("ChapterManagementService", () => {
    it("returns chapter page data for joined users", async () => {
        const { service } = makeService();

        await expect(service.getChapterById({
            user: makeUser(),
            chapterId
        })).resolves.toMatchObject({
            code: 200,
            message: "Chapter data retrieved successfully",
            body: {
                course_id: courseId,
                course_name: "Web Security",
                class_id: classId,
                class_name: "Intro",
                chapter_id: chapterId,
                chapter_name: "Recon"
            }
        });
    });

    it("rejects chapter reads from users outside the course", async () => {
        const { service } = makeService();

        await expect(service.getChapterById({
            user: makeUser({ course_ids: [] }),
            chapterId
        })).resolves.toMatchObject({
            code: 403,
            message: "You are not authorized to view this chapter."
        });
    });

    it("deletes a chapter and detaches it from the class for course owners", async () => {
        const { service, calls } = makeService();

        await expect(service.deleteChapterById({
            user: makeUser({ _id: ownerId, role: Roles.Admin }),
            chapterId
        })).resolves.toMatchObject({
            code: 200,
            message: "Chapter deleted successfully"
        });

        expect(calls).toContainEqual({
            method: "pullChapterId",
            args: [classId, chapterId]
        });
        expect(calls).toContainEqual({
            method: "deleteChapterById",
            args: [chapterId]
        });
    });

    it("updates chapter fields after owner and conflict checks", async () => {
        const { service, calls } = makeService();

        await expect(service.updateChapterById({
            user: makeUser({ _id: ownerId, role: Roles.Admin }),
            chapterId,
            body: {
                chapter_name: "Exploitation",
                chapter_content: "Updated draft",
                chapter_order: 2
            }
        })).resolves.toMatchObject({
            code: 200,
            message: "Chapter updated successfully"
        });

        expect(calls).toContainEqual({
            method: "findOneChapterLean",
            args: [{
                class_id: classId,
                chapter_name: "Exploitation",
                _id: { $ne: chapterId }
            }]
        });
        expect(calls).toContainEqual({
            method: "listChaptersLean",
            args: [{
                class_id: classId,
                chapter_order: 2,
                _id: { $ne: chapterId }
            }]
        });
        expect(calls).toContainEqual({
            method: "updateChapterById",
            args: [chapterId, {
                $set: {
                    chapter_name: "Exploitation",
                    waiting_for_approve_content: "Updated draft",
                    chapter_order: 2
                }
            }]
        });
    });

    it("rejects duplicate chapter names during update", async () => {
        const { service, calls } = makeService({
            existingNameChapter: makeChapter({ _id: "existing-chapter" })
        });

        await expect(service.updateChapterById({
            user: makeUser({ _id: ownerId, role: Roles.Admin }),
            chapterId,
            body: {
                chapter_name: "Exploitation"
            }
        })).resolves.toMatchObject({
            code: 409,
            message: "A chapter with this name already exists in this class."
        });

        expect(calls.map((call) => call.method)).not.toContain("updateChapterById");
    });

    it("rejects duplicate chapter orders during update", async () => {
        const { service, calls } = makeService({
            existingOrderChapters: [makeChapter({ _id: "other-chapter", chapter_order: 2 })]
        });

        await expect(service.updateChapterById({
            user: makeUser({ _id: ownerId, role: Roles.Admin }),
            chapterId,
            body: {
                chapter_order: 2
            }
        })).resolves.toMatchObject({
            code: 400,
            message: "A chapter with the same order already exists in this class."
        });

        expect(calls.map((call) => call.method)).not.toContain("updateChapterById");
    });

    it("adds a chapter to a class and attaches the chapter ID", async () => {
        const { service, calls } = makeService();

        await expect(service.addChapterToClass({
            user: makeUser({ _id: ownerId, role: Roles.Admin }),
            classId,
            body: {
                chapter_name: "Post Exploit",
                chapter_subtitle: "Cleanup",
                chapter_content: "Draft",
                chapter_order: 3,
                template_id: "template-2"
            }
        })).resolves.toEqual({
            code: 200,
            message: "Chapter added successfully",
            body: { chapter_id: "new-chapter-1" }
        });

        expect(calls).toContainEqual({
            method: "createChapter",
            args: [{
                chapter_name: "Post Exploit",
                chapter_subtitle: "Cleanup",
                chapter_order: 3,
                class_id: classId,
                course_id: courseId,
                has_approved_content: "",
                waiting_for_approve_content: "Draft",
                saved_content: "",
                template_id: "template-2"
            }]
        });
        expect(calls).toContainEqual({
            method: "pushChapterId",
            args: [classId, "new-chapter-1"]
        });
    });

    it("rejects invalid class IDs before adding a chapter", async () => {
        const { service, calls } = makeService();

        await expect(service.addChapterToClass({
            user: makeUser({ _id: ownerId, role: Roles.Admin }),
            classId: "bad-id",
            body: {}
        })).resolves.toMatchObject({
            code: 400,
            message: "Invalid class_id format"
        });

        expect(calls).toEqual([]);
    });
});
