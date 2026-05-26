import { describe, expect, it } from "vitest";
import { CourseLifecycleService } from "../src/modules/courses/CourseLifecycleService";

const courseId = "507f1f77bcf86cd799439031";
const actorUserId = "507f1f77bcf86cd799439032";

function makeCourse(overrides: Record<string, unknown> = {}) {
    return {
        _id: { toString: () => courseId },
        submitter_user_id: actorUserId,
        class_ids: ["class-1"],
        status: "審核中",
        save: async function () {
            return this;
        },
        ...overrides
    };
}

function makeService(options: {
    course?: any;
    classes?: any[];
    chapterRefs?: any[];
} = {}) {
    const calls: Array<{ target: string; method: string; args: unknown[] }> = [];
    const course = Object.prototype.hasOwnProperty.call(options, "course") ? options.course : makeCourse();
    const classes = options.classes ?? [{ _id: "class-1", chapter_ids: ["chapter-1"] }];
    const chapterRefs = options.chapterRefs ?? [{ _id: "class-1", chapter_ids: ["chapter-1", "chapter-2"] }];

    const courses = {
        findById: async (id: string) => {
            calls.push({ target: "courses", method: "findById", args: [id] });
            return course;
        }
    };
    const classRepository = {
        listByIds: async (classIds: string[], queryOptions?: unknown) => {
            calls.push({ target: "classes", method: "listByIds", args: [classIds, queryOptions] });
            return classes;
        },
        listChapterRefsByIds: async (classIds: string[]) => {
            calls.push({ target: "classes", method: "listChapterRefsByIds", args: [classIds] });
            return chapterRefs;
        }
    };
    const chapters = {
        syncApprovedContentByIds: async (chapterIds: string[]) => {
            calls.push({ target: "chapters", method: "syncApprovedContentByIds", args: [chapterIds] });
            return { modifiedCount: chapterIds.length };
        }
    };

    return {
        calls,
        course,
        service: new CourseLifecycleService({
            courses,
            classes: classRepository,
            chapters
        })
    };
}

describe("CourseLifecycleService", () => {
    it("approves a submitted course and syncs chapter content", async () => {
        const { service, course, calls } = makeService();

        await expect(service.approveCourse({ courseId, actorUserId })).resolves.toMatchObject({
            code: 200,
            message: "Course approved successfully"
        });

        expect(course.status).toBe("未公開");
        expect(calls).toContainEqual({
            target: "chapters",
            method: "syncApprovedContentByIds",
            args: [["chapter-1", "chapter-2"]]
        });
    });

    it("unapproves only courses waiting for review", async () => {
        const { service, course } = makeService();

        await expect(service.unapproveCourse({ courseId, actorUserId })).resolves.toMatchObject({
            code: 200,
            message: "Course unapproved successfully"
        });

        expect(course.status).toBe("審核未通過");
    });

    it("submits an owned course when classes include chapters", async () => {
        const { service, course, calls } = makeService({
            course: makeCourse({ status: "編輯中" })
        });

        await expect(service.submitCourse({ courseId, actorUserId })).resolves.toMatchObject({
            code: 200,
            message: "Course submitted for review successfully"
        });

        expect(course.status).toBe("審核中");
        expect(calls).toContainEqual({
            target: "classes",
            method: "listByIds",
            args: [["class-1"], { lean: true }]
        });
    });

    it("rejects invalid public visibility transitions", async () => {
        const { service } = makeService({
            course: makeCourse({ status: "編輯中" })
        });

        await expect(service.setVisibility({
            courseId,
            status: "公開",
            actorUserId
        })).resolves.toMatchObject({
            code: 400,
            message: "Only courses with status '未公開' can be set to '公開'"
        });
    });
});
