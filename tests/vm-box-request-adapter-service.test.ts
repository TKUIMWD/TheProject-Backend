import { describe, expect, it } from "vitest";
import { VMBoxRequestAdapterService } from "../src/modules/vm-box/VMBoxRequestAdapterService";

const user = { _id: "user-1", email: "user@example.test" } as any;

function makeService() {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const response = (method: string) => ({ code: 200, message: method, body: undefined });
    const service = new VMBoxRequestAdapterService({
        submissionCreate: {
            submitBox: async (...args) => {
                calls.push({ method: "submitBox", args });
                return response("submitBox");
            }
        } as any,
        submissionAudit: {
            auditBoxSubmission: async (...args) => {
                calls.push({ method: "auditBoxSubmission", args });
                return response("auditBoxSubmission");
            }
        } as any,
        review: {
            createReview: async (...args) => {
                calls.push({ method: "createReview", args });
                return response("createReview");
            },
            listReviews: async (...args) => {
                calls.push({ method: "listReviews", args });
                return response("listReviews");
            },
            updateReview: async (...args) => {
                calls.push({ method: "updateReview", args });
                return response("updateReview");
            },
            deleteReview: async (...args) => {
                calls.push({ method: "deleteReview", args });
                return response("deleteReview");
            }
        } as any,
        aiAssistant: {
            updateSetting: async (...args) => {
                calls.push({ method: "updateSetting", args });
                return response("updateSetting");
            }
        } as any,
        writeup: {
            submitWriteup: async (...args) => {
                calls.push({ method: "submitWriteup", args });
                return response("submitWriteup");
            },
            listPublicWriteups: async (...args) => {
                calls.push({ method: "listPublicWriteups", args });
                return response("listPublicWriteups");
            },
            listMyWriteups: async (...args) => {
                calls.push({ method: "listMyWriteups", args });
                return response("listMyWriteups");
            },
            listSubmissionWriteups: async (...args) => {
                calls.push({ method: "listSubmissionWriteups", args });
                return response("listSubmissionWriteups");
            },
            reviewWriteup: async (...args) => {
                calls.push({ method: "reviewWriteup", args });
                return response("reviewWriteup");
            },
            updateVisibility: async (...args) => {
                calls.push({ method: "updateVisibility", args });
                return response("updateVisibility");
            }
        } as any,
        answer: {
            getMyAnswerRecord: async (...args) => {
                calls.push({ method: "getMyAnswerRecord", args });
                return response("getMyAnswerRecord");
            },
            submitAnswer: async (...args) => {
                calls.push({ method: "submitAnswer", args });
                return response("submitAnswer");
            }
        } as any,
        listFactory: () => ({
            listSubmittedBoxes: async () => {
                calls.push({ method: "listSubmittedBoxes", args: [] });
                return response("listSubmittedBoxes");
            },
            listPublicBoxes: async () => {
                calls.push({ method: "listPublicBoxes", args: [] });
                return response("listPublicBoxes");
            },
            listPendingBoxes: async () => {
                calls.push({ method: "listPendingBoxes", args: [] });
                return response("listPendingBoxes");
            }
        }) as any
    });

    return { calls, service };
}

describe("VMBoxRequestAdapterService", () => {
    it("maps submission and listing requests to VM Box workflows", async () => {
        const { calls, service } = makeService();
        const body = { box_id: "box-1" };

        await service.submitBox({ user, body });
        await service.listSubmittedBoxes();
        await service.auditBoxSubmission({ user, body });
        await service.listPublicBoxes();
        await service.listPendingBoxes();

        expect(calls).toEqual([
            { method: "submitBox", args: [{ user, request: body }] },
            { method: "listSubmittedBoxes", args: [] },
            { method: "auditBoxSubmission", args: [{ user, body }] },
            { method: "listPublicBoxes", args: [] },
            { method: "listPendingBoxes", args: [] }
        ]);
    });

    it("maps review route params, query, and body to review workflows", async () => {
        const { calls, service } = makeService();
        const body = { box_id: "box-1", rating: 5, content: "good" };
        const params = { review_id: "review-1" };
        const query = { box_id: "box-1" };

        await service.rateBox({ user, body });
        await service.getBoxReviews({ user, query });
        await service.updateBoxReview({ user, params, body });
        await service.deleteBoxReview({ user, params, query });

        expect(calls).toEqual([
            { method: "createReview", args: [{ user, request: body }] },
            { method: "listReviews", args: [{ user, request: query }] },
            { method: "updateReview", args: [{ user, request: { ...body, review_id: "review-1" } }] },
            { method: "deleteReview", args: [{ user, request: { review_id: "review-1", box_id: "box-1" } }] }
        ]);
    });

    it("maps writeup route params, query, and body to writeup workflows", async () => {
        const { calls, service } = makeService();
        const body = { box_id: "box-1", content: "notes" };
        const params = { writeup_id: "writeup-1" };
        const query = { box_id: "box-1" };

        await service.submitBoxWriteup({ user, body });
        await service.getPublicBoxWriteups({ user: undefined, query });
        await service.getMyBoxWriteups({ user, query });
        await service.getBoxWriteupSubmissions({ user, query });
        await service.reviewBoxWriteup({ user, params, body });
        await service.updateBoxWriteupVisibility({ user, params, body });

        expect(calls).toEqual([
            { method: "submitWriteup", args: [{ user, request: body }] },
            { method: "listPublicWriteups", args: [{ request: query }] },
            { method: "listMyWriteups", args: [{ user, request: query }] },
            { method: "listSubmissionWriteups", args: [{ user, request: query }] },
            { method: "reviewWriteup", args: [{ user, request: { ...body, writeup_id: "writeup-1" } }] },
            { method: "updateVisibility", args: [{ user, request: { ...body, writeup_id: "writeup-1" } }] }
        ]);
    });

    it("maps AI assistant and answer requests to their workflows", async () => {
        const { calls, service } = makeService();
        const body = { box_id: "box-1", answer: "flag" };
        const query = { box_id: "box-1" };

        await service.updateBoxAiAssistantSetting({ user, body });
        await service.getMyAnswerRecord({ user, query });
        await service.submitBoxAnswer({ user, body });

        expect(calls).toEqual([
            { method: "updateSetting", args: [{ user, request: body }] },
            { method: "getMyAnswerRecord", args: [{ user, request: query }] },
            { method: "submitAnswer", args: [{ user, request: body }] }
        ]);
    });
});
