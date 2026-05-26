import { describe, expect, it } from "vitest";
import {
    buildCourseInfoDTO,
    buildCourseInfoList,
    collectCourseSubmitterIds
} from "../src/modules/courses/CourseListDTOFactory";

describe("CourseListDTOFactory", () => {
    const updateDate = new Date("2026-05-26T00:00:00.000Z");

    it("builds CourseInfo DTOs with teacher names", () => {
        expect(buildCourseInfoDTO({
            _id: { toString: () => "course-1" },
            course_name: "Web 101",
            course_subtitle: "Intro",
            duration_in_minutes: 90,
            difficulty: "Easy",
            rating: 4.5,
            update_date: updateDate,
            status: "公開"
        }, {
            _id: "user-1",
            username: "Alice"
        })).toEqual({
            _id: "course-1",
            course_name: "Web 101",
            course_subtitle: "Intro",
            duration_in_minutes: 90,
            difficulty: "Easy",
            rating: 4.5,
            teacher_name: "Alice",
            update_date: updateDate,
            status: "公開"
        });
    });

    it("returns null when submitter data is missing or malformed", () => {
        expect(buildCourseInfoDTO({ _id: "course-1" }, null)).toBeNull();
        expect(buildCourseInfoDTO({ _id: "course-1" }, { _id: "user-1", username: 123 })).toBeNull();
    });

    it("collects unique submitter IDs for batched user lookup", () => {
        expect(collectCourseSubmitterIds([
            { submitter_user_id: "user-1" },
            { submitter_user_id: { toString: () => "user-2" } },
            { submitter_user_id: "user-1" },
            { submitter_user_id: "" },
            { submitter_user_id: undefined }
        ])).toEqual(["user-1", "user-2"]);
    });

    it("builds course lists and reports courses with missing submitters", () => {
        const result = buildCourseInfoList([
            {
                _id: "course-1",
                course_name: "Web 101",
                submitter_user_id: "user-1",
                update_date: updateDate,
                status: "公開"
            },
            {
                _id: "course-2",
                course_name: "Crypto 101",
                submitter_user_id: "missing",
                update_date: updateDate,
                status: "審核中"
            }
        ], [
            { _id: "user-1", username: "Alice" }
        ]);

        expect(result.courses).toHaveLength(1);
        expect(result.courses[0]).toMatchObject({
            _id: "course-1",
            course_name: "Web 101",
            teacher_name: "Alice",
            status: "公開"
        });
        expect(result.missingSubmitterCourseIds).toEqual(["course-2"]);
    });
});
