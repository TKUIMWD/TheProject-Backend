import { describe, expect, it } from "vitest";
import { buildCoursePageDTO } from "../src/modules/courses/CoursePageDTOFactory";

describe("CoursePageDTOFactory", () => {
    it("builds course page DTOs with submitter info", () => {
        const updateDate = new Date("2026-05-26T00:00:00.000Z");

        expect(buildCoursePageDTO({
            _id: { toString: () => "course-1" },
            course_name: "Web Exploitation",
            course_subtitle: "HTTP basics",
            course_description: "Learn web security basics",
            duration_in_minutes: 120,
            difficulty: "Medium",
            rating: 4.5,
            reviews: ["review-1"],
            update_date: updateDate,
            class_ids: ["class-1"]
        }, {
            username: "Alice",
            email: "alice@example.com",
            avatar_path: "/avatars/alice.png"
        })).toEqual({
            _id: "course-1",
            course_name: "Web Exploitation",
            course_subtitle: "HTTP basics",
            course_description: "Learn web security basics",
            course_duration_in_minutes: 120,
            course_difficulty: "Medium",
            course_rating: 4.5,
            course_reviews: ["review-1"],
            course_update_date: updateDate,
            class_ids: ["class-1"],
            submitterInfo: {
                username: "Alice",
                email: "alice@example.com",
                avatar_path: "/avatars/alice.png"
            }
        });
    });

    it("keeps optional arrays stable when source fields are missing", () => {
        const dto = buildCoursePageDTO({ _id: "course-1" }, {});

        expect(dto.course_reviews).toEqual([]);
        expect(dto.class_ids).toEqual([]);
    });
});
