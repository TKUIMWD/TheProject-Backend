import { describe, expect, it } from "vitest";
import Roles from "../src/enum/role";
import { AIChatRequestAdapterService } from "../src/modules/ai-chat/AIChatRequestAdapterService";

const user = { _id: "507f1f77bcf86cd799439011", role: Roles.Admin } as any;

function makeStream(chunks: string[]) {
    return (async function* stream() {
        for (const chunk of chunks) {
            yield chunk;
        }
    })();
}

function makeService() {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const service = new AIChatRequestAdapterService({
        boxHint: {
            streamHint: (input) => {
                calls.push({ method: "streamHint", args: [input] });
                return makeStream(["hint"]);
            },
            getHint: async (input) => {
                calls.push({ method: "getHint", args: [input] });
                return { code: 200, message: "ok", body: { hint: "hint" } };
            }
        },
        platformGuide: {
            streamGuide: (input) => {
                calls.push({ method: "streamGuide", args: [input] });
                return makeStream(["guide"]);
            },
            getGuide: async (input) => {
                calls.push({ method: "getGuide", args: [input] });
                return { code: 200, message: "ok", body: { response: "guide" } };
            }
        },
        vmManagement: {
            manage: async (input) => {
                calls.push({ method: "manage", args: [input] });
                return { code: 200, message: "ok", body: { response: "managed" } };
            }
        }
    });

    return { calls, service };
}

describe("AIChatRequestAdapterService", () => {
    it("maps box hint request bodies to hint workflows", async () => {
        const { calls, service } = makeService();
        const body = { user_input: "hint" };

        await service.getBoxHint({ user, body });
        const streamChunks: string[] = [];
        for await (const chunk of service.streamBoxHint({ user, body })) {
            streamChunks.push(chunk);
        }

        expect(streamChunks).toEqual(["hint"]);
        expect(calls).toEqual([
            { method: "getHint", args: [{ user, body }] },
            { method: "streamHint", args: [{ user, body }] }
        ]);
    });

    it("maps platform guide body and token role to guide workflows", async () => {
        const { calls, service } = makeService();
        const body = { user_input: "guide" };

        await service.getPlatformGuide({ user, userRole: Roles.Admin, body });
        const streamChunks: string[] = [];
        for await (const chunk of service.streamPlatformGuide({ user, userRole: Roles.User, body })) {
            streamChunks.push(chunk);
        }

        expect(streamChunks).toEqual(["guide"]);
        expect(calls).toEqual([
            { method: "getGuide", args: [{ user, userRole: Roles.Admin, body }] },
            { method: "streamGuide", args: [{ user, userRole: Roles.User, body }] }
        ]);
    });

    it("maps VM management body and superadmin status", async () => {
        const { calls, service } = makeService();
        const body = { user_input: "list vms" };

        await service.manageVM({ user: { ...user, role: Roles.SuperAdmin }, body });

        expect(calls).toEqual([
            {
                method: "manage",
                args: [{
                    user: { ...user, role: Roles.SuperAdmin },
                    body,
                    isSuperAdmin: true
                }]
            }
        ]);
    });
});
