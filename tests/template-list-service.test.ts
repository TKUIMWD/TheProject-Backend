import { describe, expect, it } from "vitest";
import { SubmittedTemplateStatus } from "../src/interfaces/SubmittedTemplate";
import { TemplateListService } from "../src/modules/templates/TemplateListService";

const submittedDate = new Date("2026-05-26T00:00:00.000Z");

function makeTemplate(overrides: Record<string, unknown> = {}) {
    return {
        _id: "template-1",
        description: "Linux lab",
        submitted_date: submittedDate,
        submitter_user_id: "user-1",
        owner: "owner-1",
        is_public: true,
        pve_node: "pve-a",
        pve_vmid: "9000",
        ...overrides
    };
}

function makeQemuConfig(overrides: Record<string, unknown> = {}) {
    return {
        vmid: 9000,
        name: "ubuntu-template",
        node: "pve-a",
        cores: 2,
        memory: "2048",
        sockets: 1,
        numa: 0,
        cpu: "host",
        ostype: "l26",
        agent: "1",
        boot: "order=scsi0",
        digest: "digest",
        meta: "",
        vmgenid: "",
        scsihw: "virtio-scsi-pci",
        net0: "",
        net1: "",
        net2: "",
        scsi0: "NFS:9000/vm-9000-disk-0.qcow2,size=32G",
        ide2: "",
        smbios1: "",
        ...overrides
    } as any;
}

function makeService(options: {
    templates?: any[];
    submittedTemplates?: any[];
    users?: any[];
    templateInfoCode?: number;
} = {}) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const service = new TemplateListService({
        templateRepo: {
            listAll: async () => {
                calls.push({ method: "listAll", args: [] });
                return options.templates ?? [makeTemplate()];
            },
            listAccessible: async (userId) => {
                calls.push({ method: "listAccessible", args: [userId] });
                return options.templates ?? [makeTemplate()];
            },
            listByIds: async (ids) => {
                calls.push({ method: "listByIds", args: [ids] });
                return options.templates ?? [makeTemplate()];
            }
        },
        submittedTemplateRepo: {
            listSubmitted: async () => {
                calls.push({ method: "listSubmitted", args: [] });
                return options.submittedTemplates ?? [];
            }
        },
        userRepo: {
            listByIds: async (ids) => {
                calls.push({ method: "listUsersByIds", args: [ids] });
                return options.users ?? [
                    { _id: "user-1", username: "teacher", email: "teacher@example.test" },
                    { _id: "owner-1", username: "owner", email: "owner@example.test" }
                ];
            }
        },
        templateUtils: {
            getTemplateInfo: async (...args) => {
                calls.push({ method: "getTemplateInfo", args });
                const code = options.templateInfoCode ?? 200;
                return {
                    code,
                    message: code === 200 ? "ok" : "not found",
                    body: code === 200 ? makeQemuConfig() : undefined
                };
            }
        }
    });

    return { calls, service };
}

describe("TemplateListService", () => {
    it("lists all templates with submitter info and PVE config", async () => {
        const { service, calls } = makeService();

        await expect(service.listAllTemplates()).resolves.toMatchObject({
            code: 200,
            message: "Templates fetched successfully",
            body: [
                {
                    _id: "template-1",
                    name: "ubuntu-template",
                    submitter_user_info: {
                        username: "teacher",
                        email: "teacher@example.test"
                    }
                }
            ]
        });
        expect(calls.map((call) => call.method)).toEqual([
            "listAll",
            "listUsersByIds",
            "getTemplateInfo"
        ]);
    });

    it("lists accessible templates for the current user", async () => {
        const { service, calls } = makeService();

        await expect(service.listAccessibleTemplates({ _id: "user-1" } as any)).resolves.toMatchObject({
            code: 200,
            message: "Approved templates fetched successfully"
        });
        expect(calls[0]).toEqual({ method: "listAccessible", args: ["user-1"] });
    });

    it("returns an empty submitted template list without extra lookups", async () => {
        const { service, calls } = makeService({ submittedTemplates: [] });

        await expect(service.listSubmittedTemplates()).resolves.toEqual({
            code: 200,
            message: "No submitted templates found",
            body: []
        });
        expect(calls).toEqual([{ method: "listSubmitted", args: [] }]);
    });

    it("builds submitted template details and tolerates missing template config", async () => {
        const submittedTemplate = {
            _id: "submission-1",
            template_id: "template-1",
            submitter_user_id: "user-1",
            status: SubmittedTemplateStatus.not_approved,
            submitted_date: submittedDate
        };
        const { service } = makeService({
            submittedTemplates: [submittedTemplate],
            templateInfoCode: 404
        });

        await expect(service.listSubmittedTemplates()).resolves.toMatchObject({
            code: 200,
            message: "Submitted templates retrieved successfully",
            body: [
                {
                    _id: "submission-1",
                    template_name: "Linux lab",
                    submitter_user_info: {
                        username: "teacher",
                        email: "teacher@example.test"
                    }
                }
            ]
        });
    });
});
