import { describe, expect, it } from "vitest";
import { VMBoxAnswerService } from "../src/modules/vm-box/VMBoxAnswerService";

const vmId = "507f1f77bcf86cd799439051";
const boxId = "507f1f77bcf86cd799439052";
const userId = "507f1f77bcf86cd799439053";

function makeUser(overrides: Record<string, unknown> = {}) {
    return {
        _id: { toString: () => userId },
        ...overrides
    };
}

function makeVM(overrides: Record<string, unknown> = {}) {
    return {
        _id: vmId,
        owner: userId,
        is_box_vm: true,
        box_id: boxId,
        ...overrides
    };
}

function makeBox(overrides: Record<string, unknown> = {}) {
    return {
        _id: boxId,
        flag_answers: {
            user: "flag{user}",
            root: "flag{root}"
        },
        ...overrides
    };
}

function makeAnswerRecord(overrides: Record<string, unknown> = {}) {
    return {
        user: false,
        root: false,
        setCalls: [] as Array<[string, unknown]>,
        markModifiedCalls: [] as string[],
        saveCount: 0,
        set(key: string, value: unknown) {
            this.setCalls.push([key, value]);
            (this as any)[key] = value;
        },
        markModified(key: string) {
            this.markModifiedCalls.push(key);
        },
        async save() {
            this.saveCount += 1;
        },
        ...overrides
    };
}

function makeService(options: {
    vm?: any;
    box?: any;
    answerRecord?: any;
} = {}) {
    const calls: Array<{ target: string; method: string; args: unknown[] }> = [];
    const vm = Object.prototype.hasOwnProperty.call(options, "vm") ? options.vm : makeVM();
    const box = Object.prototype.hasOwnProperty.call(options, "box") ? options.box : makeBox();
    const answerRecord = options.answerRecord ?? makeAnswerRecord();

    const vmRepository = {
        findById: async (id: string) => {
            calls.push({ target: "vm", method: "findById", args: [id] });
            return vm;
        }
    };
    const boxRepository = {
        findById: async (id: string) => {
            calls.push({ target: "box", method: "findById", args: [id] });
            return box;
        }
    };
    const answerRecords = {
        getOrCreateForVM: async (vmDoc: any, queryOptions?: { lean?: boolean }) => {
            calls.push({ target: "answerRecords", method: "getOrCreateForVM", args: queryOptions === undefined ? [vmDoc] : [vmDoc, queryOptions] });
            return answerRecord;
        }
    };

    return {
        answerRecord,
        calls,
        service: new VMBoxAnswerService({
            vmRepository,
            boxRepository,
            answerRecords
        })
    };
}

describe("VMBoxAnswerService", () => {
    it("fetches answer status for a user-owned box VM", async () => {
        const { service, calls } = makeService({
            answerRecord: { user: true, root: false, hidden: true }
        });

        await expect(service.getMyAnswerRecord({
            user: makeUser(),
            request: { vm_id: vmId }
        })).resolves.toMatchObject({
            code: 200,
            body: {
                answer_record: {
                    user: true,
                    root: false
                }
            }
        });

        expect(calls.map(call => `${call.target}.${call.method}`)).toEqual([
            "vm.findById",
            "box.findById",
            "answerRecords.getOrCreateForVM"
        ]);
        expect(calls[2].args[1]).toEqual({ lean: true });
    });

    it("persists newly correct answers with dynamic-field tracking", async () => {
        const answerRecord = makeAnswerRecord({ user: false });
        const { service } = makeService({ answerRecord });

        await expect(service.submitAnswer({
            user: makeUser(),
            request: {
                vm_id: vmId,
                flag_id: "user",
                flag_answer: "flag{user}"
            }
        })).resolves.toMatchObject({
            code: 200,
            message: "Correct answer!",
            body: {
                flag_id: "user",
                correct: true
            }
        });

        expect(answerRecord.user).toBe(true);
        expect(answerRecord.setCalls).toEqual([["user", true]]);
        expect(answerRecord.markModifiedCalls).toEqual(["user"]);
        expect(answerRecord.saveCount).toBe(1);
    });

    it("does not persist incorrect answers", async () => {
        const answerRecord = makeAnswerRecord({ root: false });
        const { service } = makeService({ answerRecord });

        await expect(service.submitAnswer({
            user: makeUser(),
            request: {
                vm_id: vmId,
                flag_id: "root",
                flag_answer: "wrong"
            }
        })).resolves.toMatchObject({
            code: 200,
            message: "Incorrect answer.",
            body: {
                flag_id: "root",
                correct: false
            }
        });

        expect(answerRecord.saveCount).toBe(0);
    });

    it("rejects VM access for non-owners", async () => {
        const { service } = makeService({
            vm: makeVM({ owner: "someone-else" })
        });

        await expect(service.getMyAnswerRecord({
            user: makeUser(),
            request: { vm_id: vmId }
        })).resolves.toMatchObject({
            code: 403,
            message: "You do not have permission to access this VM"
        });
    });
});
