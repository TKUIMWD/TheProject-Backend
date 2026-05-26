import { describe, expect, it } from "vitest";
import { VMOperateService } from "../src/service/VMOperateService";

const user = {
    _id: { toString: () => "user-1" },
    username: "alice"
} as any;

function makeService() {
    const calls: any[] = [];
    const service = new VMOperateService({
        execute: async (input) => {
            calls.push(input);
            return {
                code: 200,
                message: `${input.operation} ok`,
                body: { upid: `UPID:${input.operation}` }
            };
        }
    });

    return { calls, service };
}

describe("VMOperateService", () => {
    it("delegates VM operation DTOs without Express request coupling", async () => {
        const { calls, service } = makeService();
        const input = {
            user,
            isSuperAdmin: true,
            vmId: "507f1f77bcf86cd799439011"
        };

        await expect(service.bootVM(input)).resolves.toMatchObject({ message: "boot ok" });
        await expect(service.shutdownVM(input)).resolves.toMatchObject({ message: "shutdown ok" });
        await expect(service.poweroffVM(input)).resolves.toMatchObject({ message: "poweroff ok" });
        await expect(service.rebootVM(input)).resolves.toMatchObject({ message: "reboot ok" });
        await expect(service.resetVM(input)).resolves.toMatchObject({ message: "reset ok" });

        expect(calls.map((call) => call.operation)).toEqual([
            "boot",
            "shutdown",
            "poweroff",
            "reboot",
            "reset"
        ]);
        expect(calls[0]).toMatchObject(input);
    });
});
