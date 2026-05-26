import { describe, expect, it } from "vitest";
import { CourseListService } from "../src/modules/courses/CourseListService";

const updateDate = new Date("2026-05-26T00:00:00.000Z");

function makeCourse(id: string, submitterUserId: string, status = "公開") {
    return {
        _id: id,
        course_name: `Course ${id}`,
        course_subtitle: "Subtitle",
        duration_in_minutes: 90,
        difficulty: "Easy",
        rating: 4.5,
        update_date: updateDate,
        status,
        submitter_user_id: submitterUserId
    };
}

function makeService(options: {
    allCourses?: any[];
    publicCourses?: any[];
    submittedCourses?: any[];
    users?: any[];
} = {}) {
    const calls: Array<{ target: string; method: string; args: unknown[] }> = [];
    const courses = {
        listAll: async (queryOptions?: unknown) => {
            calls.push({ target: "courses", method: "listAll", args: [queryOptions] });
            return options.allCourses ?? [];
        },
        listByStatus: async (status: string, queryOptions?: unknown) => {
            calls.push({ target: "courses", method: "listByStatus", args: [status, queryOptions] });
            if (status === "公開") return options.publicCourses ?? [];
            if (status === "審核中") return options.submittedCourses ?? [];
            return [];
        }
    };
    const users = {
        listByIds: async (userIds: string[], queryOptions?: unknown) => {
            calls.push({ target: "users", method: "listByIds", args: [userIds, queryOptions] });
            return options.users ?? [];
        }
    };

    return {
        calls,
        service: new CourseListService({ courses, users })
    };
}

describe("CourseListService", () => {
    it("lists public courses with batched submitter lookup", async () => {
        const { service, calls } = makeService({
            publicCourses: [makeCourse("course-1", "user-1")],
            users: [{ _id: "user-1", username: "Alice" }]
        });

        await expect(service.listPublicCourses()).resolves.toMatchObject({
            code: 200,
            message: "success",
            body: [
                {
                    _id: "course-1",
                    course_name: "Course course-1",
                    teacher_name: "Alice",
                    status: "公開"
                }
            ]
        });

        expect(calls).toEqual([
            { target: "courses", method: "listByStatus", args: ["公開", { lean: true }] },
            { target: "users", method: "listByIds", args: [["user-1"], { lean: true }] }
        ]);
    });

    it("returns 404 for management list when no courses exist", async () => {
        const { service } = makeService({ allCourses: [], users: [] });

        await expect(service.listAllCourses()).resolves.toMatchObject({
            code: 404,
            message: "No courses found"
        });
    });

    it("returns an empty success payload for no submitted courses", async () => {
        const { service } = makeService({ submittedCourses: [], users: [] });

        await expect(service.listSubmittedCourses()).resolves.toEqual({
            code: 200,
            message: "No pending courses found",
            body: []
        });
    });

    it("omits courses whose submitter cannot be projected", async () => {
        const { service } = makeService({
            submittedCourses: [
                makeCourse("course-1", "user-1", "審核中"),
                makeCourse("course-2", "missing", "審核中")
            ],
            users: [{ _id: "user-1", username: "Alice" }]
        });

        await expect(service.listSubmittedCourses()).resolves.toMatchObject({
            code: 200,
            body: [
                {
                    _id: "course-1",
                    teacher_name: "Alice",
                    status: "審核中"
                }
            ]
        });
    });
});
