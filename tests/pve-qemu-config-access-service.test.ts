import { describe, expect, it } from "vitest";
import Roles from "../src/enum/role";
import { PVEQemuConfigAccessService, PVEQemuConfigRole } from "../src/modules/pve/PVEQemuConfigAccessService";

const userId = "507f1f77bcf86cd799439501";
const otherVmId = "507f1f77bcf86cd799439502";
const vmId = "507f1f77bcf86cd799439503";

function makeUser(overrides: Record<string, unknown> = {}) {
    return {
        _id: userId,
        username: "alice",
        email: "alice@example.test",
        role: Roles.User,
        password_hash: "",
        isVerified: true,
        compute_resource_plan_id: "",
        used_compute_resource_id: "",
        course_ids: [],
        owned_vms: [vmId],
        owned_templates: [],
        ...overrides
    } as any;
}

function makeVM(overrides: Record<string, unknown> = {}) {
    return {
        _id: vmId,
        pve_node: "pve-a",
        pve_vmid: "101",
        owner: userId,
        ...overrides
    };
}

function makeQemuData(overrides: Record<string, unknown> = {}) {
    return {
        vmid: 101,
        name: "web-lab",
        cores: 2,
        memory: "2048",
        status: "running",
        scsi0: "NFS:101/vm-101-disk-0.qcow2,size=24G",
        net0: "virtio=AA:BB:CC:DD:EE:FF,bridge=vmbr0",
        bootdisk: "scsi0",
        ostype: "l26",
        ...overrides
    };
}

function makeService(options: {
    vm?: any | null;
    qemuResp?: any;
    pveError?: Error;
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const service = new PVEQemuConfigAccessService({
        vmRepo: {
            findById: async (...args) => {
                calls.push({ method: "findVMById", args });
                return options.vm === undefined ? makeVM() : options.vm;
            }
        },
        pve: {
            request: async (...args) => {
                calls.push({ method: "pveRequest", args });
                if (options.pveError) throw options.pveError;
                return options.qemuResp ?? { data: makeQemuData() };
            }
        }
    });

    return { calls, service };
}

async function getConfig(
    service: PVEQemuConfigAccessService,
    role: PVEQemuConfigRole,
    overrides: Record<string, unknown> = {}
) {
    return service.getQemuConfig({
        role,
        user: makeUser(overrides),
        vmId
    });
}

describe("PVEQemuConfigAccessService", () => {
    it("rejects invalid VM IDs before database or PVE access", async () => {
        const { service, calls } = makeService();

        await expect(service.getQemuConfig({
            role: "user",
            user: makeUser(),
            vmId: "not-an-id"
        })).resolves.toEqual({
            code: 400,
            message: "Invalid vm_id format",
            body: undefined
        });

        expect(calls).toEqual([]);
    });

    it("blocks user access before PVE when the VM is not owned by the user", async () => {
        const { service, calls } = makeService();

        await expect(service.getQemuConfig({
            role: "user",
            user: makeUser({ owned_vms: [otherVmId] }),
            vmId
        })).resolves.toEqual({
            code: 403,
            message: "Access denied: VM not owned by user",
            body: undefined
        });

        expect(calls).toEqual([]);
    });

    it("returns not found when the VM document does not exist", async () => {
        const { service, calls } = makeService({ vm: null });

        await expect(getConfig(service, "admin")).resolves.toEqual({
            code: 404,
            message: "VM not found",
            body: undefined
        });

        expect(calls).toEqual([{ method: "findVMById", args: [vmId] }]);
    });

    it("returns a basic config for user role with user-mode PVE access", async () => {
        const { service, calls } = makeService();

        await expect(getConfig(service, "user")).resolves.toEqual({
            code: 200,
            message: "Basic QEMU config fetched successfully",
            body: {
                vmid: 101,
                name: "web-lab",
                cores: 2,
                memory: "2048",
                node: "pve-a",
                status: "running",
                disk_size: 24
            }
        });

        expect(calls.find((call) => call.method === "pveRequest")).toMatchObject({
            args: [
                "GET",
                expect.stringContaining("/nodes/pve-a/qemu/101/config"),
                undefined,
                { mode: "user" }
            ]
        });
    });

    it("returns a detailed config for admin role with admin-mode PVE access", async () => {
        const { service, calls } = makeService();

        await expect(getConfig(service, "admin")).resolves.toMatchObject({
            code: 200,
            message: "Detailed QEMU config fetched successfully",
            body: {
                vmid: 101,
                scsi0: "NFS:101/vm-101-disk-0.qcow2,size=24G",
                net0: "virtio=AA:BB:CC:DD:EE:FF,bridge=vmbr0",
                disk_size: 24
            }
        });

        expect(calls.find((call) => call.method === "pveRequest")).toMatchObject({
            args: [
                "GET",
                expect.stringContaining("/nodes/pve-a/qemu/101/config"),
                undefined,
                { mode: "admin" }
            ]
        });
    });

    it("allows superadmin to read any VM and returns the full PVE config", async () => {
        const fullConfig = makeQemuData({ digest: "abc123" });
        const { service, calls } = makeService({ qemuResp: { data: fullConfig } });

        await expect(service.getQemuConfig({
            role: "superadmin",
            user: makeUser({ owned_vms: [] }),
            vmId
        })).resolves.toEqual({
            code: 200,
            message: "Full QEMU config fetched successfully",
            body: fullConfig
        });

        expect(calls).toEqual([
            { method: "findVMById", args: [vmId] },
            {
                method: "pveRequest",
                args: ["GET", expect.stringContaining("/nodes/pve-a/qemu/101/config")]
            }
        ]);
    });

    it("returns QEMU config not found when PVE returns no config data", async () => {
        const { service } = makeService({ qemuResp: {} });

        await expect(getConfig(service, "user")).resolves.toEqual({
            code: 404,
            message: "QEMU config not found",
            body: undefined
        });
    });

    it("returns internal server error when PVE config loading throws", async () => {
        const { service } = makeService({ pveError: new Error("PVE unavailable") });

        await expect(getConfig(service, "admin")).resolves.toEqual({
            code: 500,
            message: "Internal Server Error",
            body: undefined
        });
    });
});
