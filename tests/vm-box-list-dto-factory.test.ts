import { describe, expect, it } from "vitest";
import { SubmittedBoxStatus } from "../src/interfaces/SubmittedBox";
import {
    buildDefaultVMBoxTemplateInfo,
    buildPendingBoxInfo,
    buildVMBoxPublishedBoxLookup,
    buildPublicBoxInfo,
    buildSubmittedBoxInfo,
    buildVMBoxWriteupCountMap,
    buildVMBoxTemplateMap,
    buildVMBoxTemplateInfoFromQemuConfig,
    buildVMBoxSubmitterInfoMap,
    collectVMBoxIds,
    collectVMBoxSubmitterIds,
    collectVMBoxTemplateIds,
    getVMBoxTemplate,
    getVMBoxPublishedBoxForSubmission,
    getVMBoxWriteupCount,
    getVMBoxSubmitterInfo
} from "../src/modules/vm-box/VMBoxListDTOFactory";

const submittedDate = new Date("2026-05-01T00:00:00.000Z");
const updatedDate = new Date("2026-05-02T00:00:00.000Z");

const templateInfo = {
    name: "Privilege Escalation",
    description: "Linux lab",
    default_cpu_cores: 4,
    default_memory_size: 4096,
    default_disk_size: 40,
    owner: "admin@example.com"
};

describe("VMBoxListDTOFactory", () => {
    it("builds default template info", () => {
        expect(buildDefaultVMBoxTemplateInfo("Fallback description")).toEqual({
            name: "Unknown Template",
            description: "Fallback description",
            default_cpu_cores: 2,
            default_memory_size: 2048,
            default_disk_size: 20,
            owner: "Unknown"
        });
    });

    it("builds template info from QEMU config and template metadata", () => {
        expect(buildVMBoxTemplateInfoFromQemuConfig({
            description: "Template description",
            owner: "owner@example.test"
        }, {
            name: "qemu-name",
            cores: 4,
            memory: "8192",
            scsi0: "local-lvm:vm-101-disk-0,size=64G"
        }, "Fallback description")).toEqual({
            name: "qemu-name",
            description: "Template description",
            default_cpu_cores: 4,
            default_memory_size: 8192,
            default_disk_size: 64,
            owner: "owner@example.test"
        });
    });

    it("falls back to template description when QEMU name is missing", () => {
        expect(buildVMBoxTemplateInfoFromQemuConfig({
            description: "Template description",
            owner: "owner@example.test"
        }, {
            cores: 2,
            memory: "2048",
            scsi0: "local-lvm:vm-102-disk-0,size=20G"
        }, "Fallback description")).toMatchObject({
            name: "Template description",
            description: "Template description",
            owner: "owner@example.test"
        });
    });

    it("builds submitted box info and prefers published box rating/AI state", () => {
        expect(buildSubmittedBoxInfo({
            _id: { toString: () => "submission-1" },
            status: SubmittedBoxStatus.approved,
            box_setup_description: "Setup",
            submitted_date: submittedDate,
            status_updated_date: updatedDate,
            flag_answers: { user: "flag{user}", ignored: 123 },
            allow_ai_assistant: false,
            design_md: "design",
            setup_md: "setup",
            writeup_md: "writeup"
        }, templateInfo, {
            _id: { toString: () => "box-1" },
            rating_score: 4.5,
            review_count: 2,
            updated_date: updatedDate,
            allow_ai_assistant: true
        }, {
            username: "teacher",
            email: "teacher@example.com"
        })).toEqual({
            _id: { toString: expect.any(Function) },
            submitted_box_id: "submission-1",
            published_box_id: "box-1",
            name: "Privilege Escalation",
            description: "Linux lab",
            submitted_date: submittedDate,
            owner: "admin@example.com",
            default_cpu_cores: 4,
            default_memory_size: 4096,
            default_disk_size: 40,
            is_public: true,
            box_setup_description: "Setup",
            rating_score: 4.5,
            review_count: 2,
            updated_date: updatedDate,
            status: SubmittedBoxStatus.approved,
            reject_reason: undefined,
            flag_answers: { user: "flag{user}" },
            allow_ai_assistant: true,
            design_md: "design",
            setup_md: "setup",
            writeup_md: "writeup",
            submitter_user_info: {
                username: "teacher",
                email: "teacher@example.com"
            }
        });
    });

    it("builds public box info with flag count and writeup count", () => {
        expect(buildPublicBoxInfo({
            _id: "box-1",
            submitted_date: submittedDate,
            is_public: true,
            rating_score: 5,
            review_count: 1,
            updated_date: updatedDate,
            update_log: "[]",
            flag_answers: new Map<string, string>([["root", "flag{root}"]]),
            allow_ai_assistant: false,
            submitted_box_id: "submission-1"
        }, templateInfo, {
            publicWriteupCount: 3
        })).toMatchObject({
            _id: "box-1",
            name: "Privilege Escalation",
            flag_count: 1,
            allow_ai_assistant: false,
            submitted_box_id: "submission-1",
            public_writeup_count: 3
        });
    });

    it("builds pending box info with no ratings and private status", () => {
        expect(buildPendingBoxInfo({
            _id: "submission-1",
            box_setup_description: "Setup",
            submitted_date: submittedDate,
            status_updated_date: updatedDate,
            allow_ai_assistant: undefined,
            design_md: "design",
            setup_md: "setup",
            writeup_md: "writeup"
        }, templateInfo)).toMatchObject({
            _id: "submission-1",
            is_public: false,
            rating_score: undefined,
            review_count: undefined,
            updated_date: updatedDate,
            allow_ai_assistant: true
        });
    });

    it("collects unique submitter IDs for batched submitter lookup", () => {
        expect(collectVMBoxSubmitterIds([
            { submitter_user_id: "user-1" },
            { submitter_user_id: { toString: () => "user-2" } },
            { submitter_user_id: "user-1" },
            { submitter_user_id: "" },
            { submitter_user_id: undefined }
        ])).toEqual(["user-1", "user-2"]);
    });

    it("builds submitter info maps and ignores malformed users", () => {
        const map = buildVMBoxSubmitterInfoMap([
            { _id: "user-1", username: "alice", email: "alice@example.test" },
            { _id: "user-2", username: "bob", email: 123 },
            { username: "missing-id", email: "missing@example.test" }
        ]);

        expect(getVMBoxSubmitterInfo(map, "user-1")).toEqual({
            username: "alice",
            email: "alice@example.test"
        });
        expect(getVMBoxSubmitterInfo(map, { toString: () => "user-1" })).toEqual({
            username: "alice",
            email: "alice@example.test"
        });
        expect(getVMBoxSubmitterInfo(map, "user-2")).toBeUndefined();
        expect(getVMBoxSubmitterInfo(map, undefined)).toBeUndefined();
    });

    it("collects unique template IDs for batched template lookup", () => {
        expect(collectVMBoxTemplateIds([
            { vmtemplate_id: "template-1" },
            { vmtemplate_id: { toString: () => "template-2" } },
            { vmtemplate_id: "template-1" },
            { vmtemplate_id: "" },
            { vmtemplate_id: null }
        ])).toEqual(["template-1", "template-2"]);
    });

    it("builds template maps and ignores malformed templates", () => {
        const template = {
            _id: "template-1",
            description: "Template",
            owner: "owner"
        };
        const map = buildVMBoxTemplateMap([
            template,
            { description: "missing-id" }
        ]);

        expect(getVMBoxTemplate(map, "template-1")).toBe(template);
        expect(getVMBoxTemplate(map, { toString: () => "template-1" })).toBe(template);
        expect(getVMBoxTemplate(map, undefined)).toBeUndefined();
        expect(getVMBoxTemplate(map, "missing")).toBeUndefined();
    });

    it("collects unique box IDs for batched public writeup counts", () => {
        expect(collectVMBoxIds([
            { _id: "box-1" },
            { _id: { toString: () => "box-2" } },
            { _id: "box-1" },
            { _id: "" },
            { _id: undefined }
        ])).toEqual(["box-1", "box-2"]);
    });

    it("builds public writeup count maps and defaults missing counts to zero", () => {
        const map = buildVMBoxWriteupCountMap([
            { _id: "box-1", count: 3 },
            { _id: "box-2", count: "2" },
            { count: 5 }
        ]);

        expect(getVMBoxWriteupCount(map, "box-1")).toBe(3);
        expect(getVMBoxWriteupCount(map, { toString: () => "box-1" })).toBe(3);
        expect(getVMBoxWriteupCount(map, "box-2")).toBe(0);
        expect(getVMBoxWriteupCount(map, undefined)).toBe(0);
    });

    it("resolves published boxes by submitted_box_id before legacy matching", () => {
        const linkedBox = {
            _id: "linked-box",
            submitted_box_id: "submission-1",
            vmtemplate_id: "template-1",
            submitter_user_id: "user-1",
            submitted_date: submittedDate,
            is_public: false
        };
        const legacyBox = {
            _id: "legacy-box",
            vmtemplate_id: "template-1",
            submitter_user_id: "user-1",
            submitted_date: submittedDate,
            is_public: true
        };

        const lookup = buildVMBoxPublishedBoxLookup([legacyBox, linkedBox]);

        expect(getVMBoxPublishedBoxForSubmission(lookup, {
            _id: "submission-1",
            vmtemplate_id: "template-1",
            submitter_user_id: "user-1",
            submitted_date: submittedDate
        })).toBe(linkedBox);
    });

    it("falls back to legacy published-box matching for older records", () => {
        const legacyBox = {
            _id: "legacy-box",
            vmtemplate_id: "template-1",
            submitter_user_id: "user-1",
            submitted_date: submittedDate,
            is_public: true
        };
        const privateBox = {
            _id: "private-box",
            vmtemplate_id: "template-2",
            submitter_user_id: "user-2",
            submitted_date: submittedDate,
            is_public: false
        };

        const lookup = buildVMBoxPublishedBoxLookup([legacyBox, privateBox]);

        expect(getVMBoxPublishedBoxForSubmission(lookup, {
            _id: "submission-legacy",
            vmtemplate_id: "template-1",
            submitter_user_id: "user-1",
            submitted_date: submittedDate
        })).toBe(legacyBox);
        expect(getVMBoxPublishedBoxForSubmission(lookup, {
            _id: "submission-private",
            vmtemplate_id: "template-2",
            submitter_user_id: "user-2",
            submitted_date: submittedDate
        })).toBeUndefined();
    });
});
