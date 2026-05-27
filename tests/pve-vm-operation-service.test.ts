import { describe, expect, it } from "vitest";
import { PVEVMOperationService } from "../src/modules/pve/PVEVMOperationService";

function makeService(options: { status?: string; operationData?: unknown; throwOnOperation?: boolean } = {}) {
    const calls: Array<{ method: string; url: string; body: unknown; options: unknown }> = [];
    const service = new PVEVMOperationService({
        pve: {
            request: async (method, url, body, requestOptions) => {
                calls.push({ method, url, body, options: requestOptions });
                if (url.includes("/status/current")) {
                    return { data: { status: options.status ?? "running" } };
                }
                if (options.throwOnOperation) throw new Error("PVE rejected operation");
                return { data: options.operationData ?? "UPID:operation" };
            }
        }
    });

    return { calls, service };
}

describe("PVEVMOperationService", () => {
    it("submits a valid VM operation through the admin PVE client", async () => {
        const { service, calls } = makeService();

        await expect(service.operateVM({ node: "gapvea", vmid: "101", action: "shutdown" })).resolves.toEqual({
            code: 202,
            message: "VM shutdown task submitted",
            body: {
                node: "gapvea",
                vmid: 101,
                action: "shutdown",
                upid: "UPID:operation",
                status_before: "running"
            }
        });

        expect(calls.map((call) => call.method)).toEqual(["GET", "POST"]);
        expect(calls[1]).toMatchObject({
            method: "POST",
            url: expect.stringContaining("/nodes/gapvea/qemu/101/status/shutdown"),
            options: {
                mode: "admin",
                headers: { "Content-Type": "application/x-www-form-urlencoded" }
            }
        });
    });

    it("rejects invalid input before calling PVE", async () => {
        const { service, calls } = makeService();

        await expect(service.operateVM({ node: "gapvea", vmid: "bad", action: "start" })).resolves.toEqual({
            code: 400,
            message: "vmid is invalid",
            body: undefined
        });
        expect(calls).toEqual([]);
    });

    it("rejects invalid state before submitting an operation", async () => {
        const { service, calls } = makeService({ status: "stopped" });

        await expect(service.operateVM({ node: "gapvea", vmid: "101", action: "reboot" })).resolves.toEqual({
            code: 400,
            message: "VM must be running to reboot",
            body: undefined
        });
        expect(calls.map((call) => call.method)).toEqual(["GET"]);
    });

    it("returns a backend error when PVE operation submission fails", async () => {
        const { service } = makeService({ throwOnOperation: true });

        await expect(service.operateVM({ node: "gapvea", vmid: "101", action: "stop" })).resolves.toEqual({
            code: 500,
            message: "Internal Server Error",
            body: undefined
        });
    });
});
