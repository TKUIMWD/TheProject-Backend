import { describe, expect, it } from "vitest";
import { CourseRepository } from "../src/modules/courses/CourseRepository";

function makeRepository() {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const course = {
        _id: "course-1",
        course_name: "Course",
        status: "公開",
        save: async () => course
    };

    const makeQuery = <T>(result: T) => ({
        lean: () => {
            calls.push({ method: "lean", args: [] });
            return {
                exec: async () => result
            };
        },
        exec: async () => result
    });

    const model = {
        createDocument: (payload: unknown) => {
            calls.push({ method: "createDocument", args: [payload] });
            return { ...course, ...(payload as any) };
        },
        find: (query?: unknown) => {
            calls.push({ method: "find", args: query === undefined ? [] : [query] });
            return makeQuery([course]);
        },
        findById: (id: string) => {
            calls.push({ method: "findById", args: [id] });
            return makeQuery({ ...course, _id: id });
        },
        findOne: (query: unknown) => {
            calls.push({ method: "findOne", args: [query] });
            return {
                exec: async () => course
            };
        },
        findByIdAndUpdate: (id: string, update: unknown, options?: unknown) => {
            calls.push({ method: "findByIdAndUpdate", args: options === undefined ? [id, update] : [id, update, options] });
            return {
                exec: async () => ({ ...course, _id: id, ...(update as any) })
            };
        },
        findByIdAndDelete: (id: unknown) => {
            calls.push({ method: "findByIdAndDelete", args: [id] });
            return {
                exec: async () => ({ ...course, _id: id })
            };
        }
    };

    return {
        calls,
        repository: new CourseRepository(model as any)
    };
}

describe("CourseRepository", () => {
    it("creates course documents", () => {
        const { repository, calls } = makeRepository();
        const payload = { course_name: "Course" };

        expect(repository.createCourseDocument(payload)).toMatchObject(payload);

        expect(calls).toEqual([
            { method: "createDocument", args: [payload] }
        ]);
    });

    it("finds courses by ID", async () => {
        const { repository, calls } = makeRepository();

        await repository.findById("course-1");

        expect(calls).toEqual([
            { method: "findById", args: ["course-1"] }
        ]);
    });

    it("finds lean courses by ID", async () => {
        const { repository, calls } = makeRepository();

        await repository.findById("course-1", { lean: true });

        expect(calls).toEqual([
            { method: "findById", args: ["course-1"] },
            { method: "lean", args: [] }
        ]);
    });

    it("finds courses by name", async () => {
        const { repository, calls } = makeRepository();

        await repository.findByName("Course");

        expect(calls).toEqual([
            { method: "findOne", args: [{ course_name: "Course" }] }
        ]);
    });

    it("updates courses by ID", async () => {
        const { repository, calls } = makeRepository();
        const update = { status: "編輯中" };
        const options = { new: true };

        await repository.updateById("course-1", update, options);

        expect(calls).toEqual([
            { method: "findByIdAndUpdate", args: ["course-1", update, options] }
        ]);
    });

    it("deletes courses by ID", async () => {
        const { repository, calls } = makeRepository();

        await repository.deleteById("course-1");

        expect(calls).toEqual([
            { method: "findByIdAndDelete", args: ["course-1"] }
        ]);
    });

    it("lists all lean courses", async () => {
        const { repository, calls } = makeRepository();

        await repository.listAll({ lean: true });

        expect(calls).toEqual([
            { method: "find", args: [] },
            { method: "lean", args: [] }
        ]);
    });

    it("lists courses by status", async () => {
        const { repository, calls } = makeRepository();

        await repository.listByStatus("公開", { lean: true });

        expect(calls).toEqual([
            { method: "find", args: [{ status: "公開" }] },
            { method: "lean", args: [] }
        ]);
    });
});
