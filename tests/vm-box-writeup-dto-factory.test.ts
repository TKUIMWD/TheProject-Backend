import { describe, expect, it } from "vitest";
import { BoxWriteupStatus } from "../src/interfaces/BoxWriteup";
import { DEFAULT_AVATAR } from "../src/utils/avatarUpload";
import {
    buildBoxWriteupDTO,
    buildBoxWriteupRelatedEntityMap,
    collectBoxWriteupBoxIds,
    collectBoxWriteupUserIds,
    getBoxWriteupRelatedEntity
} from "../src/modules/vm-box/VMBoxWriteupDTOFactory";

const submittedDate = new Date("2026-05-01T00:00:00.000Z");
const updatedDate = new Date("2026-05-02T00:00:00.000Z");
const reviewedDate = new Date("2026-05-03T00:00:00.000Z");

const writeup = {
    _id: { toString: () => "writeup-1" },
    box_id: "box-1",
    title: "Useful path",
    content_md: "Long writeup",
    status: BoxWriteupStatus.rejected,
    is_public: false,
    submitted_date: submittedDate,
    updated_date: updatedDate,
    reviewed_by_user_id: "reviewer-1",
    reviewed_date: reviewedDate,
    reject_reason: "needs more detail"
};

describe("VMBoxWriteupDTOFactory", () => {
    it("builds public-safe writeup DTOs", () => {
        expect(buildBoxWriteupDTO(writeup, {
            author: {
                username: "student",
                email: "student@example.com",
                avatar_path: ""
            },
            box: {
                _id: { toString: () => "box-1" },
                box_setup_description: "Box setup"
            },
            template: { description: "Template name" }
        })).toEqual({
            _id: "writeup-1",
            box_id: "box-1",
            title: "Useful path",
            content_md: "Long writeup",
            status: BoxWriteupStatus.rejected,
            is_public: false,
            submitted_date: submittedDate,
            updated_date: updatedDate,
            reviewed_by_user_id: undefined,
            reviewed_date: reviewedDate,
            reject_reason: undefined,
            author_info: {
                username: "student",
                email: undefined,
                avatar_path: DEFAULT_AVATAR
            },
            reviewer_info: undefined,
            box_info: {
                _id: "box-1",
                name: "Template name",
                description: "Box setup"
            },
            can_modify: false,
            can_review: false
        });
    });

    it("includes private review fields for moderators", () => {
        expect(buildBoxWriteupDTO(writeup, {
            author: { username: "student", email: "student@example.com", avatar_path: "/a.png" },
            reviewer: { username: "teacher", email: "teacher@example.com" },
            includePrivate: true,
            canReview: true
        })).toMatchObject({
            reviewed_by_user_id: "reviewer-1",
            reject_reason: "needs more detail",
            reviewer_info: {
                username: "teacher",
                email: "teacher@example.com"
            },
            author_info: {
                username: "student",
                email: "student@example.com",
                avatar_path: "/a.png"
            },
            can_review: true
        });
    });

    it("shows reject reason to the writeup owner and falls back for unknown author", () => {
        expect(buildBoxWriteupDTO(writeup, { canModify: true })).toMatchObject({
            reject_reason: "needs more detail",
            author_info: {
                username: "Unknown User",
                avatar_path: DEFAULT_AVATAR
            },
            can_modify: true
        });
    });

    it("collects unique author and reviewer IDs for batched user lookup", () => {
        expect(collectBoxWriteupUserIds([
            { author_user_id: "author-1", reviewed_by_user_id: "reviewer-1" },
            { author_user_id: "author-1", reviewed_by_user_id: { toString: () => "reviewer-2" } },
            { author_user_id: "", reviewed_by_user_id: null }
        ])).toEqual(["author-1", "reviewer-1", "reviewer-2"]);
    });

    it("collects unique box IDs for batched box lookup", () => {
        expect(collectBoxWriteupBoxIds([
            { box_id: "box-1" },
            { box_id: { toString: () => "box-2" } },
            { box_id: "box-1" },
            { box_id: undefined }
        ])).toEqual(["box-1", "box-2"]);
    });

    it("builds related entity maps and ignores malformed entities", () => {
        const entity = { _id: "entity-1", name: "Entity" };
        const map = buildBoxWriteupRelatedEntityMap([
            entity,
            { name: "missing-id" }
        ]);

        expect(getBoxWriteupRelatedEntity(map, "entity-1")).toBe(entity);
        expect(getBoxWriteupRelatedEntity(map, { toString: () => "entity-1" })).toBe(entity);
        expect(getBoxWriteupRelatedEntity(map, undefined)).toBeUndefined();
        expect(getBoxWriteupRelatedEntity(map, "missing")).toBeUndefined();
    });
});
