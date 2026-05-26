import { describe, expect, it } from "vitest";
import {
    buildMissingSubmittedTemplateDetails,
    buildSubmittedTemplateDetails,
    buildTemplateInfoDTO,
    buildTemplateDocumentMap,
    buildTemplateSubmitterInfoMap,
    collectSubmittedTemplateTemplateIds,
    collectSubmittedTemplateUserIds,
    collectTemplateSubmitterIds,
    getTemplateDocument,
    getTemplateSubmitterInfo
} from "../src/modules/templates/TemplateListDTOFactory";
import { SubmittedTemplateStatus } from "../src/interfaces/SubmittedTemplate";

const submittedDate = new Date("2026-05-26T00:00:00.000Z");

describe("TemplateListDTOFactory", () => {
    it("builds template info DTOs with submitter info", () => {
        expect(buildTemplateInfoDTO({
            _id: "template-1",
            description: "Linux privilege lab",
            submitted_date: submittedDate,
            owner: "owner-1",
            is_public: true
        }, {
            vmid: 9000,
            name: "ubuntu-template",
            node: "pve-a",
            cores: 4,
            memory: "4096",
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
            smbios1: ""
        }, {
            username: "teacher",
            email: "teacher@example.test"
        })).toEqual({
            _id: "template-1",
            name: "ubuntu-template",
            description: "Linux privilege lab",
            submitted_date: submittedDate,
            owner: "owner-1",
            is_public: true,
            default_cpu_cores: 4,
            default_memory_size: 4096,
            default_disk_size: 32,
            submitter_user_info: {
                username: "teacher",
                email: "teacher@example.test"
            }
        });
    });

    it("collects unique submitter IDs for batched lookup", () => {
        expect(collectTemplateSubmitterIds([
            { submitter_user_id: "user-1" },
            { submitter_user_id: { toString: () => "user-2" } },
            { submitter_user_id: "user-1" },
            { submitter_user_id: "" },
            { submitter_user_id: undefined }
        ])).toEqual(["user-1", "user-2"]);
    });

    it("builds submitter info maps and ignores malformed users", () => {
        const map = buildTemplateSubmitterInfoMap([
            { _id: "user-1", username: "alice", email: "alice@example.test" },
            { _id: "user-2", username: "bob", email: 123 },
            { username: "missing-id", email: "missing@example.test" }
        ]);

        expect(getTemplateSubmitterInfo(map, "user-1")).toEqual({
            username: "alice",
            email: "alice@example.test"
        });
        expect(getTemplateSubmitterInfo(map, { toString: () => "user-1" })).toEqual({
            username: "alice",
            email: "alice@example.test"
        });
        expect(getTemplateSubmitterInfo(map, "user-2")).toBeUndefined();
        expect(getTemplateSubmitterInfo(map, undefined)).toBeUndefined();
    });

    it("collects submitted template and user IDs for batched lookup", () => {
        const submissions = [
            { template_id: "template-1", submitter_user_id: "user-1" },
            { template_id: { toString: () => "template-2" }, submitter_user_id: "user-1" },
            { template_id: "template-1", submitter_user_id: "" }
        ];
        const templates = [
            { _id: "template-1", owner: "owner-1" },
            { _id: "template-2", owner: { toString: () => "owner-2" } },
            { _id: "template-3", owner: undefined }
        ];

        expect(collectSubmittedTemplateTemplateIds(submissions)).toEqual(["template-1", "template-2"]);
        expect(collectSubmittedTemplateUserIds(submissions, templates)).toEqual(["user-1", "owner-1", "owner-2"]);
    });

    it("builds template document maps", () => {
        const template = { _id: "template-1", owner: "owner-1" };
        const map = buildTemplateDocumentMap([
            template,
            { owner: "missing-id" }
        ]);

        expect(getTemplateDocument(map, "template-1")).toBe(template);
        expect(getTemplateDocument(map, { toString: () => "template-1" })).toBe(template);
        expect(getTemplateDocument(map, undefined)).toBeUndefined();
    });

    it("builds submitted template details and missing-template fallbacks", () => {
        const submittedTemplate = {
            _id: "submission-1",
            status: SubmittedTemplateStatus.not_approved,
            template_id: "template-1",
            submitter_user_id: "user-1",
            submitted_date: submittedDate,
            reject_reason: undefined
        };
        const template = {
            description: "Submitted lab",
            pve_vmid: "9001",
            pve_node: "pve-a",
            cipassword: "secret",
            ciuser: "student"
        };
        const qemuConfig = {
            vmid: 9001,
            name: "submitted-template",
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
            scsi0: "NFS:9001/vm-9001-disk-0.qcow2,size=24G",
            ide2: "",
            smbios1: ""
        };

        expect(buildSubmittedTemplateDetails(submittedTemplate, template, qemuConfig, "owner", {
            username: "submitter",
            email: "submitter@example.test"
        })).toMatchObject({
            _id: "submission-1",
            template_name: "submitted-template",
            template_description: "Submitted lab",
            owner: "owner",
            pve_vmid: "9001",
            pve_node: "pve-a",
            default_cpu_cores: 2,
            default_memory_size: 2048,
            default_disk_size: 24,
            cipassword: "secret",
            ciuser: "student",
            submitter_user_info: {
                username: "submitter",
                email: "submitter@example.test"
            }
        });

        expect(buildMissingSubmittedTemplateDetails(submittedTemplate)).toMatchObject({
            template_name: "Template Not Found",
            template_description: "Template data unavailable",
            owner: "Unknown",
            default_cpu_cores: 0,
            submitter_user_info: {
                username: "",
                email: ""
            }
        });
    });
});
