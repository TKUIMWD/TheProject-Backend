import { describe, expect, it } from "vitest";
import { VMBoxAnswerRecordRepository } from "../src/modules/vm-box/VMBoxAnswerRecordRepository";

function makeVM() {
    return {
        answer_record: "answer-1",
        saveCount: 0,
        async save() {
            this.saveCount += 1;
        }
    };
}

describe("VMBoxAnswerRecordRepository", () => {
    it("loads an existing answer record", async () => {
        const calls: Array<{ method: string; args: unknown[] }> = [];
        const repository = new VMBoxAnswerRecordRepository({
            findById: async (id, options) => {
                calls.push({ method: "findById", args: [id, options] });
                return { _id: id, user: true };
            },
            create: async (payload) => {
                calls.push({ method: "create", args: [payload] });
                return payload;
            }
        });
        const vm = makeVM();

        await expect(repository.getOrCreateForVM(vm, { lean: true })).resolves.toEqual({
            _id: "answer-1",
            user: true
        });

        expect(vm.saveCount).toBe(0);
        expect(calls).toEqual([
            { method: "findById", args: ["answer-1", { lean: true }] }
        ]);
    });

    it("creates and attaches a new answer record when missing", async () => {
        const calls: Array<{ method: string; args: unknown[] }> = [];
        const repository = new VMBoxAnswerRecordRepository({
            findById: async (id, options) => {
                calls.push({ method: "findById", args: [id, options] });
                return null;
            },
            create: async (payload) => {
                calls.push({ method: "create", args: [payload] });
                return {
                    _id: { toString: () => "answer-created" },
                    root: false,
                    toObject: () => ({ _id: "answer-created", root: false })
                };
            }
        });
        const vm = makeVM();

        await expect(repository.getOrCreateForVM(vm, { lean: true })).resolves.toEqual({
            _id: "answer-created",
            root: false
        });

        expect(vm.answer_record).toBe("answer-created");
        expect(vm.saveCount).toBe(1);
        expect(calls).toEqual([
            { method: "findById", args: ["answer-1", { lean: true }] },
            { method: "create", args: [{}] }
        ]);
    });

    it("creates a new answer record when the existing lookup fails", async () => {
        const calls: Array<{ method: string; args: unknown[] }> = [];
        const repository = new VMBoxAnswerRecordRepository({
            findById: async (id, options) => {
                calls.push({ method: "findById", args: [id, options] });
                throw new Error("lookup failed");
            },
            create: async (payload) => {
                calls.push({ method: "create", args: [payload] });
                return {
                    _id: { toString: () => "answer-created" }
                };
            }
        });
        const vm = makeVM();

        await expect(repository.getOrCreateForVM(vm)).resolves.toMatchObject({
            _id: { toString: expect.any(Function) }
        });

        expect(vm.answer_record).toBe("answer-created");
        expect(vm.saveCount).toBe(1);
        expect(calls).toEqual([
            { method: "findById", args: ["answer-1", {}] },
            { method: "create", args: [{}] }
        ]);
    });
});
