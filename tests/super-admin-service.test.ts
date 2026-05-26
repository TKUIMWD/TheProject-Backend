import { describe, expect, it } from "vitest";
import { SuperAdminService } from "../src/service/SuperAdminService";

const actor = {
    _id: { toString: () => "superadmin-1" },
    username: "root",
    role: "superadmin"
} as any;

function makeService() {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const service = new SuperAdminService({
        changeUserRole: async (input) => {
            calls.push({ method: "changeUserRole", args: [input] });
            return { code: 200, message: "role changed", body: undefined };
        },
        assignCRPToUser: async (input) => {
            calls.push({ method: "assignCRPToUser", args: [input] });
            return { code: 200, message: "assigned", body: { ok: true } };
        },
        getAllUsers: async (inputActor) => {
            calls.push({ method: "getAllUsers", args: [inputActor] });
            return { code: 200, message: "users", body: [{ username: "alice" }] as any[] };
        },
        getAllAdminUsers: async (inputActor) => {
            calls.push({ method: "getAllAdminUsers", args: [inputActor] });
            return { code: 200, message: "admins", body: [{ username: "admin" }] as any[] };
        }
    });

    return { calls, service };
}

describe("SuperAdminService", () => {
    it("delegates SuperAdmin DTO inputs without Express request coupling", async () => {
        const { calls, service } = makeService();
        const body = {
            userId: "507f1f77bcf86cd799439011",
            newRole: "admin"
        };

        await expect(service.changeUserRole({ actor, body })).resolves.toMatchObject({ message: "role changed" });
        await expect(service.assignCRPToUser({ actor, body })).resolves.toMatchObject({ message: "assigned" });
        await expect(service.getAllUsers(actor)).resolves.toMatchObject({ body: [{ username: "alice" }] });
        await expect(service.getAllAdminUsers(actor)).resolves.toMatchObject({ body: [{ username: "admin" }] });

        expect(calls).toEqual([
            { method: "changeUserRole", args: [{ actor, body }] },
            { method: "assignCRPToUser", args: [{ actor, body }] },
            { method: "getAllUsers", args: [actor] },
            { method: "getAllAdminUsers", args: [actor] }
        ]);
    });
});
