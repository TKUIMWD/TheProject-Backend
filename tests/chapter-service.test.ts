import { describe, expect, it } from "vitest";
import { ChapterService } from "../src/service/ChapterService";

const user = { _id: "507f1f77bcf86cd799439011" };

function makeService() {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const service = new ChapterService({
        getChapterById: async (input) => {
            calls.push({ method: "getChapterById", args: [input] });
            return { code: 200, message: "chapter", body: undefined };
        },
        updateChapterById: async (input) => {
            calls.push({ method: "updateChapterById", args: [input] });
            return { code: 200, message: "updated", body: undefined };
        },
        deleteChapterById: async (input) => {
            calls.push({ method: "deleteChapterById", args: [input] });
            return { code: 200, message: "deleted", body: undefined };
        },
        addChapterToClass: async (input) => {
            calls.push({ method: "addChapterToClass", args: [input] });
            return { code: 200, message: "added", body: { chapter_id: "chapter-1" } };
        }
    });

    return { calls, service };
}

describe("ChapterService", () => {
    it("delegates chapter DTO inputs without Express request coupling", async () => {
        const { calls, service } = makeService();
        const params = { chapterId: "chapter-1", classId: "class-1" };
        const body = { chapter_name: "Recon" };

        await expect(service.getChapterById({ user, params })).resolves.toMatchObject({ message: "chapter" });
        await expect(service.UpdateChapterById({ user, params, body })).resolves.toMatchObject({ message: "updated" });
        await expect(service.DeleteChapterById({ user, params })).resolves.toMatchObject({ message: "deleted" });
        await expect(service.AddChapterToClass({ user, params, body })).resolves.toMatchObject({ message: "added" });

        expect(calls).toEqual([
            { method: "getChapterById", args: [{ user, params }] },
            { method: "updateChapterById", args: [{ user, params, body }] },
            { method: "deleteChapterById", args: [{ user, params }] },
            { method: "addChapterToClass", args: [{ user, params, body }] }
        ]);
    });
});
