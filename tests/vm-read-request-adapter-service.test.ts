import { describe, expect, it } from "vitest";
import { VMReadRequestAdapterService } from "../src/modules/vm/VMReadRequestAdapterService";

const user = { _id: "507f1f77bcf86cd799439011" } as any;

function makeService() {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const service = new VMReadRequestAdapterService({
        read: {
            listUserOwnedVMs: async (inputUser) => {
                calls.push({ method: "listUserOwnedVMs", args: [inputUser] });
                return { code: 200, message: "ok", body: [] };
            },
            listAllVMs: async () => {
                calls.push({ method: "listAllVMs", args: [] });
                return { code: 200, message: "ok", body: [] };
            },
            getVMStatus: async (input) => {
                calls.push({ method: "getVMStatus", args: [input] });
                return { code: 200, message: "ok", body: { status: "running" } };
            },
            getVMNetworkInfo: async (input) => {
                calls.push({ method: "getVMNetworkInfo", args: [input] });
                return { code: 200, message: "ok", body: { interfaces: [] } };
            }
        }
    });

    return { calls, service };
}

describe("VMReadRequestAdapterService", () => {
    it("delegates VM list requests to read workflows", async () => {
        const { calls, service } = makeService();

        await service.listUserOwnedVMs({ user });
        await service.listAllVMs();

        expect(calls).toEqual([
            { method: "listUserOwnedVMs", args: [user] },
            { method: "listAllVMs", args: [] }
        ]);
    });

    it("maps VM status and network query ids to read workflows", async () => {
        const { calls, service } = makeService();
        const query = { vm_id: "507f1f77bcf86cd799439012" };

        await service.getVMStatus({ user, isSuperAdmin: true, query });
        await service.getVMNetworkInfo({ user, isSuperAdmin: false, query });

        expect(calls).toEqual([
            {
                method: "getVMStatus",
                args: [{
                    user,
                    isSuperAdmin: true,
                    vmId: "507f1f77bcf86cd799439012"
                }]
            },
            {
                method: "getVMNetworkInfo",
                args: [{
                    user,
                    isSuperAdmin: false,
                    vmId: "507f1f77bcf86cd799439012"
                }]
            }
        ]);
    });
});
