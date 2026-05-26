import { describe, expect, it } from "vitest";
import { CourseStructureRequestAdapterService } from "../src/modules/courses/CourseStructureRequestAdapterService";

const user = { _id: "507f1f77bcf86cd799439011" };

function makeService() {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const service = new CourseStructureRequestAdapterService({
        classManagement: {
            getClassById: async (input) => {
                calls.push({ method: "getClassById", args: [input] });
                return { code: 200, message: "ok", body: undefined };
            },
            updateClassById: async (input) => {
                calls.push({ method: "updateClassById", args: [input] });
                return { code: 200, message: "ok", body: undefined };
            },
            deleteClassById: async (input) => {
                calls.push({ method: "deleteClassById", args: [input] });
                return { code: 200, message: "ok", body: undefined };
            },
            addClassToCourse: async (input) => {
                calls.push({ method: "addClassToCourse", args: [input] });
                return { code: 200, message: "ok", body: { class_id: "class-1" } };
            }
        },
        chapterManagement: {
            getChapterById: async (input) => {
                calls.push({ method: "getChapterById", args: [input] });
                return { code: 200, message: "ok", body: undefined };
            },
            updateChapterById: async (input) => {
                calls.push({ method: "updateChapterById", args: [input] });
                return { code: 200, message: "ok", body: undefined };
            },
            deleteChapterById: async (input) => {
                calls.push({ method: "deleteChapterById", args: [input] });
                return { code: 200, message: "ok", body: undefined };
            },
            addChapterToClass: async (input) => {
                calls.push({ method: "addChapterToClass", args: [input] });
                return { code: 200, message: "ok", body: { chapter_id: "chapter-1" } };
            }
        }
    });

    return { calls, service };
}

describe("CourseStructureRequestAdapterService", () => {
    it("maps class route params and body to class management workflows", async () => {
        const { calls, service } = makeService();
        const body = { class_name: "Intro" };

        await service.getClassById({ user, params: { classId: "class-1" } });
        await service.updateClassById({ user, params: { classId: "class-1" }, body });
        await service.deleteClassById({ user, params: { classId: "class-1" } });
        await service.addClassToCourse({ user, params: { courseId: "course-1" }, body });

        expect(calls).toEqual([
            { method: "getClassById", args: [{ user, classId: "class-1" }] },
            { method: "updateClassById", args: [{ user, classId: "class-1", body }] },
            { method: "deleteClassById", args: [{ user, classId: "class-1" }] },
            { method: "addClassToCourse", args: [{ user, courseId: "course-1", body }] }
        ]);
    });

    it("maps chapter route params and body to chapter management workflows", async () => {
        const { calls, service } = makeService();
        const body = { chapter_name: "Recon" };

        await service.getChapterById({ user, params: { chapterId: "chapter-1" } });
        await service.updateChapterById({ user, params: { chapterId: "chapter-1" }, body });
        await service.deleteChapterById({ user, params: { chapterId: "chapter-1" } });
        await service.addChapterToClass({ user, params: { classId: "class-1" }, body });

        expect(calls).toEqual([
            { method: "getChapterById", args: [{ user, chapterId: "chapter-1" }] },
            { method: "updateChapterById", args: [{ user, chapterId: "chapter-1", body }] },
            { method: "deleteChapterById", args: [{ user, chapterId: "chapter-1" }] },
            { method: "addChapterToClass", args: [{ user, classId: "class-1", body }] }
        ]);
    });
});
