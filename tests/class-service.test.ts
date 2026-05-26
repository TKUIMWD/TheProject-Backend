import { describe, expect, it } from "vitest";
import { ClassService } from "../src/service/ClassService";

const user = { _id: "507f1f77bcf86cd799439011" };

function makeService() {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const service = new ClassService({
        getClassById: async (input) => {
            calls.push({ method: "getClassById", args: [input] });
            return { code: 200, message: "class", body: undefined };
        },
        updateClassById: async (input) => {
            calls.push({ method: "updateClassById", args: [input] });
            return { code: 200, message: "updated", body: undefined };
        },
        deleteClassById: async (input) => {
            calls.push({ method: "deleteClassById", args: [input] });
            return { code: 200, message: "deleted", body: undefined };
        },
        addClassToCourse: async (input) => {
            calls.push({ method: "addClassToCourse", args: [input] });
            return { code: 200, message: "added", body: { class_id: "class-1" } };
        }
    });

    return { calls, service };
}

describe("ClassService", () => {
    it("delegates class DTO inputs without Express request coupling", async () => {
        const { calls, service } = makeService();
        const params = { classId: "class-1", courseId: "course-1" };
        const body = { class_name: "Intro" };

        await expect(service.getClassById({ user, params })).resolves.toMatchObject({ message: "class" });
        await expect(service.UpdateClassById({ user, params, body })).resolves.toMatchObject({ message: "updated" });
        await expect(service.DeleteClassById({ user, params })).resolves.toMatchObject({ message: "deleted" });
        await expect(service.AddClassToCourse({ user, params, body })).resolves.toMatchObject({ message: "added" });

        expect(calls).toEqual([
            { method: "getClassById", args: [{ user, params }] },
            { method: "updateClassById", args: [{ user, params, body }] },
            { method: "deleteClassById", args: [{ user, params }] },
            { method: "addClassToCourse", args: [{ user, params, body }] }
        ]);
    });
});
