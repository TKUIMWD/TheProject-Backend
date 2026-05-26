import { describe, expect, it } from "vitest";
import {
    buildCourseMenuDTO,
    collectCourseMenuChapterIds,
    selectFirstCourseTemplateId
} from "../src/modules/courses/CourseMenuDTOFactory";

describe("CourseMenuDTOFactory", () => {
    const classes = [
        {
            _id: "class-2",
            class_order: 2,
            class_name: "Privilege Escalation",
            chapter_ids: ["chapter-3"]
        },
        {
            _id: "class-1",
            class_order: 1,
            class_name: "Enumeration",
            chapter_ids: ["chapter-2", "chapter-1", "missing"]
        }
    ];

    const chapters = [
        {
            _id: "chapter-1",
            chapter_order: 2,
            chapter_name: "Web scan",
            template_id: "template-web"
        },
        {
            _id: "chapter-2",
            chapter_order: 1,
            chapter_name: "Network scan",
            template_id: ""
        },
        {
            _id: "chapter-3",
            chapter_order: 1,
            chapter_name: "Linux privesc",
            template_id: "template-linux"
        }
    ];

    it("collects unique chapter IDs for batched lookup", () => {
        expect(collectCourseMenuChapterIds([
            { chapter_ids: ["chapter-1", { toString: () => "chapter-2" }, "chapter-1"] },
            { chapter_ids: ["", null] }
        ])).toEqual(["chapter-1", "chapter-2"]);
    });

    it("builds course menu DTOs in class and chapter ID order", () => {
        expect(buildCourseMenuDTO(classes, chapters)).toEqual({
            class_titles: [
                {
                    class_id: "class-2",
                    class_order: 2,
                    class_name: "Privilege Escalation",
                    chapter_titles: [
                        {
                            chapter_id: "chapter-3",
                            chapter_order: 1,
                            chapter_name: "Linux privesc"
                        }
                    ]
                },
                {
                    class_id: "class-1",
                    class_order: 1,
                    class_name: "Enumeration",
                    chapter_titles: [
                        {
                            chapter_id: "chapter-2",
                            chapter_order: 1,
                            chapter_name: "Network scan"
                        },
                        {
                            chapter_id: "chapter-1",
                            chapter_order: 2,
                            chapter_name: "Web scan"
                        }
                    ]
                }
            ]
        });
    });

    it("selects the first template by class order then chapter order", () => {
        expect(selectFirstCourseTemplateId(classes, chapters)).toBe("template-web");
        expect(selectFirstCourseTemplateId(classes, [
            { _id: "chapter-1", chapter_order: 2, chapter_name: "Web scan", template_id: " " },
            { _id: "chapter-3", chapter_order: 1, chapter_name: "Linux privesc", template_id: "template-linux" }
        ])).toBe("template-linux");
        expect(selectFirstCourseTemplateId(classes, [])).toBeNull();
    });
});
