import { describe, expect, it } from "vitest";
import {
    buildReviewInfoList,
    buildReviewWithUserInfo,
    buildReviewerInfoMap,
    collectReviewerUserIds
} from "../src/modules/reviews/ReviewDTOFactory";

describe("ReviewDTOFactory", () => {
    const defaultAvatar = "/default-avatar.png";

    it("collects unique reviewer IDs for batched user lookup", () => {
        expect(collectReviewerUserIds([
            { reviewer_user_id: "user-1" },
            { reviewer_user_id: { toString: () => "user-2" } },
            { reviewer_user_id: "user-1" },
            { reviewer_user_id: "" },
            { reviewer_user_id: undefined }
        ])).toEqual(["user-1", "user-2"]);
    });

    it("builds reviewer info maps with avatar fallback", () => {
        const map = buildReviewerInfoMap([
            { _id: "user-1", username: "alice", avatar_path: "/alice.png" },
            { _id: "user-2", username: "bob", avatar_path: "" },
            { _id: "user-3", username: 123, avatar_path: "/bad.png" }
        ], defaultAvatar);

        expect(map.get("user-1")).toEqual({ username: "alice", avatar_path: "/alice.png" });
        expect(map.get("user-2")).toEqual({ username: "bob", avatar_path: defaultAvatar });
        expect(map.has("user-3")).toBe(false);
    });

    it("builds review DTOs with can_modify and unknown reviewer fallback", () => {
        const reviewerInfoById = buildReviewerInfoMap([
            { _id: "user-1", username: "alice", avatar_path: "/alice.png" }
        ], defaultAvatar);

        expect(buildReviewWithUserInfo({
            _id: { toString: () => "review-1" },
            reviewer_user_id: "user-1",
            rating_score: 5,
            comment: "great",
            submitted_date: new Date("2026-05-01T00:00:00.000Z")
        }, reviewerInfoById, "user-1", defaultAvatar)).toMatchObject({
            _id: "review-1",
            can_modify: true,
            reviewer_info: { username: "alice", avatar_path: "/alice.png" }
        });

        expect(buildReviewWithUserInfo({
            _id: "review-2",
            reviewer_user_id: "missing"
        }, reviewerInfoById, "user-1", defaultAvatar)).toMatchObject({
            _id: "review-2",
            can_modify: false,
            reviewer_info: { username: "Unknown User", avatar_path: defaultAvatar }
        });
    });

    it("sorts review DTOs newest first", () => {
        const reviewerInfoById = buildReviewerInfoMap([], defaultAvatar);
        const output = buildReviewInfoList([
            { _id: "old", reviewer_user_id: "u1", submitted_date: new Date("2026-05-01T00:00:00.000Z") },
            { _id: "new", reviewer_user_id: "u2", submitted_date: new Date("2026-05-02T00:00:00.000Z") }
        ], reviewerInfoById, "u1", defaultAvatar);

        expect(output.map((item) => item._id)).toEqual(["new", "old"]);
    });
});
