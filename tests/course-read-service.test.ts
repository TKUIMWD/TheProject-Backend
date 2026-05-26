import { describe, expect, it } from "vitest";
import Roles from "../src/enum/role";
import { CourseReadService } from "../src/modules/courses/CourseReadService";

const courseId = "507f1f77bcf86cd799439021";
const otherCourseId = "507f1f77bcf86cd799439022";
const submitterId = "507f1f77bcf86cd799439023";

function makeUser(overrides: Record<string, unknown> = {}) {
    return {
        _id: "507f1f77bcf86cd799439024",
        username: "student",
        email: "student@example.com",
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
        course_subtitle: "HTTP basics",
        course_description: "Learn web security",
        duration_in_minutes: 120,
        difficulty: "Medium",
        reviews: ["review-1"],
        rating: 4.5,
        class_ids: ["class-1"],
        update_date: new Date("2026-05-26T00:00:00.000Z"),
        submitter_user_id: submitterId,
        status: "公開",
        ...overrides
    } as any;
}

function makeClasses() {
    return [
        {
            _id: "class-1",
            class_order: 1,
            class_name: "Enumeration",
            chapter_ids: ["chapter-1", "chapter-2"]
        }
    ];
}

function makeChapters() {
    return [
        {
            _id: "chapter-1",
            chapter_order: 1,
            chapter_name: "Network scan",
            template_id: ""
        },
        {
            _id: "chapter-2",
            chapter_order: 2,
            chapter_name: "Web scan",
            template_id: "template-web"
        }
    ];
}

function makeService(options: {
    course?: any | null;
    submitter?: any | null;
    classes?: any[];
    chapters?: any[];
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];

    const service = new CourseReadService({
        userRepo: {
            findById: async (id, queryOptions) => {
                calls.push({ method: "findUserById", args: [id, queryOptions] });
                return options.submitter === undefined
                    ? { username: "teacher", email: "teacher@example.com", avatar_path: "/avatar.png" }
                    : options.submitter;
            }
        },
        courseRepo: {
            findById: async (id, queryOptions) => {
                calls.push({ method: "findCourseById", args: [id, queryOptions] });
                return options.course === undefined ? makeCourse() : options.course;
            }
        },
        classRepo: {
            listByIds: async (ids, queryOptions) => {
                calls.push({ method: "listClassesByIds", args: [ids, queryOptions] });
                return options.classes ?? makeClasses();
            }
        },
        chapterRepo: {
            listByIds: async (ids, queryOptions) => {
                calls.push({ method: "listChaptersByIds", args: [ids, queryOptions] });
                return options.chapters ?? makeChapters();
            }
        }
    });

    return { calls, service };
}

describe("CourseReadService", () => {
    it("builds joined course page DTOs", async () => {
        const { service, calls } = makeService();

        await expect(service.getCoursePage({
            user: makeUser(),
            courseId
        })).resolves.toMatchObject({
            code: 200,
            message: "Course page data retrieved successfully",
            body: {
                _id: courseId,
                course_name: "Web Security",
                submitterInfo: {
                    username: "teacher",
                    email: "teacher@example.com"
                }
            }
        });

        expect(calls).toEqual([
            { method: "findCourseById", args: [courseId, { lean: true }] },
            { method: "findUserById", args: [submitterId, { lean: true }] }
        ]);
    });

    it("returns course page DTO with 403 for users who have not joined", async () => {
        const { service } = makeService();

        await expect(service.getCoursePage({
            user: makeUser({ course_ids: [otherCourseId] }),
            courseId
        })).resolves.toMatchObject({
            code: 403,
            message: "You are not joined to this course",
            body: {
                _id: courseId
            }
        });
    });

    it("builds course menu and preserves unauthorized response body", async () => {
        const { service } = makeService();

        await expect(service.getCourseMenu({
            user: makeUser({ course_ids: [] }),
            courseId
        })).resolves.toMatchObject({
            code: 403,
            message: "You are not joined to this course",
            body: {
                class_titles: [{
                    class_id: "class-1",
                    chapter_titles: [
                        { chapter_id: "chapter-1" },
                        { chapter_id: "chapter-2" }
                    ]
                }]
            }
        });
    });

    it("selects the first template for joined users", async () => {
        const { service, calls } = makeService();

        await expect(service.getFirstTemplate({
            user: makeUser(),
            courseId
        })).resolves.toEqual({
            code: 200,
            message: "success",
            body: { template_id: "template-web" }
        });

        expect(calls).toContainEqual({ method: "listClassesByIds", args: [["class-1"], { lean: true }] });
        expect(calls).toContainEqual({ method: "listChaptersByIds", args: [["chapter-1", "chapter-2"], { lean: true }] });
    });

    it("allows course submitters to access the first template without joining", async () => {
        const { service } = makeService();

        await expect(service.getFirstTemplate({
            user: makeUser({ _id: submitterId, course_ids: [] }),
            courseId
        })).resolves.toMatchObject({
            code: 200,
            body: { template_id: "template-web" }
        });
    });

    it("rejects malformed course IDs before repository calls", async () => {
        const { service, calls } = makeService();

        await expect(service.getCoursePage({
            user: makeUser(),
            courseId: "bad-id"
        })).resolves.toMatchObject({
            code: 400,
            message: "Invalid course_id format"
        });

        expect(calls).toEqual([]);
    });

    it("returns missing chapter/template states for first-template lookup", async () => {
        const { service } = makeService({
            chapters: [
                { _id: "chapter-1", chapter_order: 1, chapter_name: "Network scan", template_id: "" }
            ]
        });

        await expect(service.getFirstTemplate({
            user: makeUser(),
            courseId
        })).resolves.toMatchObject({
            code: 404,
            message: "No template_id found in any chapter of this course"
        });
    });
});
