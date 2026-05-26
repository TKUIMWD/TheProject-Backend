import { describe, expect, it } from "vitest";
import { CourseRequestAdapterService } from "../src/modules/courses/CourseRequestAdapterService";

const user = { _id: "507f1f77bcf86cd799439011" };

describe("CourseRequestAdapterService", () => {
    it("keeps invalid route course_id handling outside the course mutation workflow", async () => {
        const service = new CourseRequestAdapterService();

        await expect(service.updateCourseById({
            user,
            params: { courseId: "bad-id" },
            body: { course_name: "Updated" }
        })).resolves.toEqual({
            code: 400,
            message: "Invalid course_id format",
            body: undefined
        });
    });

    it("normalizes body courseId validation for lifecycle adapters", async () => {
        const service = new CourseRequestAdapterService();

        await expect(service.submitCourse({
            user,
            body: { courseId: "bad-id" }
        })).resolves.toEqual({
            code: 400,
            message: "Invalid course_id format",
            body: undefined
        });
    });
});
