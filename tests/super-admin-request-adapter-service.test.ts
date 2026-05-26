import { describe, expect, it } from "vitest";
import { SuperAdminRequestAdapterService } from "../src/modules/super-admin/SuperAdminRequestAdapterService";

const actor = {
    _id: { toString: () => "superadmin-1" },
    username: "root",
    role: "superadmin",
    isVerified: true
} as any;

function makeService() {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const users = [{ username: "alice", role: "user" }] as any[];
    const admins = [{ username: "admin", role: "admin" }] as any[];
    const service = new SuperAdminRequestAdapterService({
        userManagement: {
            changeUserRole: async (input) => {
                calls.push({ method: "changeUserRole", args: [input] });
                return { code: 200, message: "role changed", body: undefined };
            },
            assignCRPToUser: async (input) => {
                calls.push({ method: "assignCRPToUser", args: [input] });
                return { code: 200, message: "assigned", body: { user: "alice" } };
            },
            listRegularUsers: async (inputActor) => {
                calls.push({ method: "listRegularUsers", args: [inputActor] });
                return { code: 200, message: "users", body: users };
            },
            listAdminUsers: async (inputActor) => {
                calls.push({ method: "listAdminUsers", args: [inputActor] });
                return { code: 200, message: "admins", body: admins };
            }
        }
    });

    return { calls, service };
}

describe("SuperAdminRequestAdapterService", () => {
    it("maps role-change body to user management input", async () => {
        const { service, calls } = makeService();

        await service.changeUserRole({
            actor,
            body: {
                userId: "507f1f77bcf86cd799439011",
                newRole: "admin"
            }
        });

        expect(calls).toEqual([
            {
                method: "changeUserRole",
                args: [{
                    actor,
                    userId: "507f1f77bcf86cd799439011",
                    newRole: "admin"
                }]
            }
        ]);
    });

    it("maps CRP assignment body to user management input", async () => {
        const { service, calls } = makeService();

        await service.assignCRPToUser({
            actor,
            body: {
                userId: "507f1f77bcf86cd799439011",
                planId: "507f1f77bcf86cd799439012"
            }
        });

        expect(calls).toEqual([
            {
                method: "assignCRPToUser",
                args: [{
                    actor,
                    userId: "507f1f77bcf86cd799439011",
                    planId: "507f1f77bcf86cd799439012"
                }]
            }
        ]);
    });

    it("delegates list calls without request-shaped data", async () => {
        const { service, calls } = makeService();

        await expect(service.getAllUsers(actor)).resolves.toMatchObject({
            code: 200,
            body: [{ username: "alice" }]
        });
        await expect(service.getAllAdminUsers(actor)).resolves.toMatchObject({
            code: 200,
            body: [{ username: "admin" }]
        });

        expect(calls).toEqual([
            { method: "listRegularUsers", args: [actor] },
            { method: "listAdminUsers", args: [actor] }
        ]);
    });
});
