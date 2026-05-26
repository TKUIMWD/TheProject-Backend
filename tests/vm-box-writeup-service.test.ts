import { describe, expect, it } from "vitest";
import Roles from "../src/enum/role";
import { BoxWriteupStatus } from "../src/interfaces/BoxWriteup";
import { VMBoxWriteupService } from "../src/modules/vm-box/VMBoxWriteupService";

const boxId = "507f1f77bcf86cd799439011";
const writeupId = "507f1f77bcf86cd799439012";
const authorId = "507f1f77bcf86cd799439013";
const adminId = "507f1f77bcf86cd799439014";
const templateId = "507f1f77bcf86cd799439015";
const longContent = "This writeup explains enumeration, exploitation, validation, and remediation steps in enough detail for review.";

function makeUser(overrides: Record<string, unknown> = {}) {
    return {
        _id: { toString: () => authorId },
        role: Roles.User,
        email: "student@example.test",
        ...overrides
    };
}

function makeAdmin(overrides: Record<string, unknown> = {}) {
    return makeUser({
        _id: { toString: () => adminId },
        role: Roles.Admin,
        email: "admin@example.test",
        ...overrides
    });
}

function makeBox(overrides: Record<string, unknown> = {}) {
    return {
        _id: boxId,
        is_public: true,
        submitter_user_id: adminId,
        vmtemplate_id: templateId,
        box_setup_description: "Training box",
        ...overrides
    };
}

function makeWriteup(overrides: Record<string, unknown> = {}) {
    return {
        _id: writeupId,
        box_id: boxId,
        author_user_id: authorId,
        title: "Useful path",
        content_md: longContent,
        status: BoxWriteupStatus.pending,
        is_public: false,
        submitted_date: new Date("2026-05-26T00:00:00.000Z"),
        updated_date: new Date("2026-05-26T00:00:00.000Z"),
        save: async () => undefined,
        ...overrides
    };
}

function makeService(options: {
    box?: any;
    writeup?: any;
    activeExisting?: any;
    listedWriteups?: any[];
    ownedBoxIds?: string[];
} = {}) {
    const calls: Array<{ target: string; method: string; args: unknown[] }> = [];
    const box = Object.prototype.hasOwnProperty.call(options, "box") ? options.box : makeBox();
    const writeup = Object.prototype.hasOwnProperty.call(options, "writeup") ? options.writeup : makeWriteup();
    const listedWriteups = options.listedWriteups ?? [writeup];

    const boxes = {
        findById: async (id: string) => {
            calls.push({ target: "boxes", method: "findById", args: [id] });
            return box;
        },
        listByIds: async (ids: string[]) => {
            calls.push({ target: "boxes", method: "listByIds", args: [ids] });
            return ids.includes(boxId) && box ? [box] : [];
        },
        listOwnedBoxIds: async (submitterUserId: string) => {
            calls.push({ target: "boxes", method: "listOwnedBoxIds", args: [submitterUserId] });
            return options.ownedBoxIds ?? [boxId];
        }
    };

    const writeups = {
        createWriteupDocument: (payload: unknown) => {
            calls.push({ target: "writeups", method: "createWriteupDocument", args: [payload] });
            return makeWriteup(payload as Record<string, unknown>);
        },
        findActiveByAuthorAndBox: async (requestBoxId: string, requestAuthorId: string) => {
            calls.push({ target: "writeups", method: "findActiveByAuthorAndBox", args: [requestBoxId, requestAuthorId] });
            return options.activeExisting ?? null;
        },
        listPublicApprovedByBox: async (requestBoxId: string) => {
            calls.push({ target: "writeups", method: "listPublicApprovedByBox", args: [requestBoxId] });
            return listedWriteups;
        },
        listNewestByFilter: async (filter: unknown) => {
            calls.push({ target: "writeups", method: "listNewestByFilter", args: [filter] });
            return listedWriteups;
        },
        findById: async (id: string) => {
            calls.push({ target: "writeups", method: "findById", args: [id] });
            return writeup;
        }
    };

    const users = {
        listByIds: async (ids: string[]) => {
            calls.push({ target: "users", method: "listByIds", args: [ids] });
            return [
                { _id: authorId, username: "student", email: "student@example.test", avatar_path: "/student.png" },
                { _id: adminId, username: "admin", email: "admin@example.test", avatar_path: "/admin.png" }
            ].filter((user) => ids.includes(user._id));
        }
    };

    const templates = {
        listByIds: async (ids: string[]) => {
            calls.push({ target: "templates", method: "listByIds", args: [ids] });
            return ids.includes(templateId) ? [{ _id: templateId, description: "Template name" }] : [];
        }
    };

    return {
        box,
        calls,
        writeup,
        service: new VMBoxWriteupService({
            boxes,
            writeups,
            users,
            templates
        })
    };
}

describe("VMBoxWriteupService", () => {
    it("submits a new writeup and returns a private DTO for the author", async () => {
        const { service, calls } = makeService();

        await expect(service.submitWriteup({
            user: makeUser(),
            request: {
                box_id: boxId,
                title: "Useful path",
                content_md: longContent
            }
        })).resolves.toMatchObject({
            code: 200,
            body: {
                writeup: {
                    box_id: boxId,
                    title: "Useful path",
                    can_modify: true
                }
            }
        });

        expect(calls.map(call => `${call.target}.${call.method}`)).toEqual([
            "boxes.findById",
            "writeups.findActiveByAuthorAndBox",
            "writeups.createWriteupDocument",
            "users.listByIds",
            "boxes.listByIds",
            "templates.listByIds"
        ]);
    });

    it("lists moderator submissions with owned-box filtering for admins", async () => {
        const { service, calls } = makeService();

        await expect(service.listSubmissionWriteups({
            user: makeAdmin(),
            request: { status: BoxWriteupStatus.pending }
        })).resolves.toMatchObject({
            code: 200,
            body: {
                total_writeups: 1,
                writeups: [
                    {
                        can_review: true,
                        author_info: {
                            email: "student@example.test"
                        }
                    }
                ]
            }
        });

        expect(calls).toContainEqual({
            target: "boxes",
            method: "listOwnedBoxIds",
            args: [adminId]
        });
        expect(calls).toContainEqual({
            target: "writeups",
            method: "listNewestByFilter",
            args: [{ status: BoxWriteupStatus.pending, box_id: { $in: [boxId] } }]
        });
    });

    it("approves a writeup and toggles public visibility when requested", async () => {
        const { service, writeup } = makeService();

        await expect(service.reviewWriteup({
            user: makeAdmin(),
            request: {
                writeup_id: writeupId,
                status: BoxWriteupStatus.approved,
                is_public: true
            }
        })).resolves.toMatchObject({
            code: 200,
            body: {
                writeup: {
                    status: BoxWriteupStatus.approved,
                    is_public: true,
                    reviewed_by_user_id: adminId
                }
            }
        });

        expect(writeup.status).toBe(BoxWriteupStatus.approved);
        expect(writeup.is_public).toBe(true);
        expect(writeup.reviewed_by_user_id).toBe(adminId);
    });

    it("rejects visibility updates for non-approved writeups", async () => {
        const { service } = makeService({
            writeup: makeWriteup({ status: BoxWriteupStatus.pending })
        });

        await expect(service.updateVisibility({
            user: makeAdmin(),
            request: {
                writeup_id: writeupId,
                is_public: true
            }
        })).resolves.toMatchObject({
            code: 400,
            message: "Only approved writeups can be published"
        });
    });
});
