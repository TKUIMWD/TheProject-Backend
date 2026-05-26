import { describe, expect, it } from "vitest";
import { VMBoxRepository } from "../src/modules/vm-box/VMBoxRepository";

function makeRepository(options: { linkedBox?: any } = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const box = {
        _id: "box-1",
        vmtemplate_id: "template-1",
        submitter_user_id: "user-1",
        submitted_box_id: "submission-1",
        save: async () => box
    };

    const model = {
        createDocument: (payload: unknown) => {
            calls.push({ method: "createDocument", args: [payload] });
            return { ...box, ...(payload as any) };
        },
        find: (query: unknown) => {
            calls.push({ method: "find", args: [query] });
            return {
                exec: async () => [box]
            };
        },
        findOne: (query: unknown) => {
            calls.push({ method: "findOne", args: [query] });
            return {
                exec: async () => options.linkedBox === undefined ? box : options.linkedBox
            };
        },
        findById: (id: string) => {
            calls.push({ method: "findById", args: [id] });
            return {
                exec: async () => ({ ...box, _id: id } as any)
            };
        }
    };

    return {
        calls,
        repository: new VMBoxRepository(model as any)
    };
}

describe("VMBoxRepository", () => {
    it("finds VM boxes by ID", async () => {
        const { repository, calls } = makeRepository();

        await expect(repository.findById("box-1")).resolves.toMatchObject({
            _id: "box-1",
            vmtemplate_id: "template-1"
        });

        expect(calls).toEqual([
            { method: "findById", args: ["box-1"] }
        ]);
    });

    it("creates VM box documents", () => {
        const { repository, calls } = makeRepository();
        const payload = { submitted_box_id: "submission-1" };

        expect(repository.createBoxDocument(payload)).toMatchObject(payload);

        expect(calls).toEqual([
            { method: "createDocument", args: [payload] }
        ]);
    });

    it("lists VM boxes by IDs", async () => {
        const { repository, calls } = makeRepository();

        await repository.listByIds(["box-1", "box-2"]);

        expect(calls).toEqual([
            { method: "find", args: [{ _id: { $in: ["box-1", "box-2"] } }] }
        ]);
    });

    it("skips empty VM box ID lookups", async () => {
        const { repository, calls } = makeRepository();

        await expect(repository.listByIds([])).resolves.toEqual([]);

        expect(calls).toEqual([]);
    });

    it("lists public VM boxes", async () => {
        const { repository, calls } = makeRepository();

        await repository.listPublicBoxes();

        expect(calls).toEqual([
            { method: "find", args: [{ is_public: true }] }
        ]);
    });

    it("lists owned VM box IDs", async () => {
        const { repository, calls } = makeRepository();

        await expect(repository.listOwnedBoxIds("user-1")).resolves.toEqual(["box-1"]);

        expect(calls).toEqual([
            { method: "find", args: [{ submitter_user_id: "user-1" }] }
        ]);
    });

    it("finds published boxes through submitted_box_id first", async () => {
        const { repository, calls } = makeRepository();

        await expect(repository.findPublishedForSubmission({ _id: "submission-1" })).resolves.toMatchObject({
            submitted_box_id: "submission-1"
        });

        expect(calls).toEqual([
            { method: "findOne", args: [{ submitted_box_id: "submission-1" }] }
        ]);
    });

    it("falls back to legacy published-box matching for submissions", async () => {
        const { repository, calls } = makeRepository({ linkedBox: null });
        const submittedDate = new Date("2026-05-26T00:00:00.000Z");

        await repository.findPublishedForSubmission({
            _id: "submission-1",
            vmtemplate_id: "template-1",
            submitter_user_id: "user-1",
            submitted_date: submittedDate
        });

        expect(calls).toEqual([
            { method: "findOne", args: [{ submitted_box_id: "submission-1" }] },
            {
                method: "findOne",
                args: [{
                    vmtemplate_id: "template-1",
                    submitter_user_id: "user-1",
                    submitted_date: submittedDate,
                    is_public: true
                }]
            }
        ]);
    });

    it("lists published boxes for submitted-box lookup maps", async () => {
        const { repository, calls } = makeRepository();
        const submittedDate = new Date("2026-05-26T00:00:00.000Z");

        await repository.listPublishedForSubmissions([{
            _id: "submission-1",
            vmtemplate_id: "template-1",
            submitter_user_id: "user-1",
            submitted_date: submittedDate
        }]);

        expect(calls).toEqual([
            {
                method: "find",
                args: [{
                    $or: [
                        { submitted_box_id: { $in: ["submission-1"] } },
                        {
                            is_public: true,
                            vmtemplate_id: { $in: ["template-1"] },
                            submitter_user_id: { $in: ["user-1"] },
                            submitted_date: { $in: [submittedDate] }
                        }
                    ]
                }]
            }
        ]);
    });
});
