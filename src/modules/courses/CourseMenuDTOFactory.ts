import { CourseMenu } from "../../interfaces/Course/CourseMenu";

type CourseClassSource = {
    _id?: unknown;
    class_order?: number;
    class_name?: string;
    chapter_ids?: unknown[];
};

type CourseChapterSource = {
    _id?: unknown;
    chapter_order?: number;
    chapter_name?: string;
    template_id?: unknown;
};

export function collectCourseMenuChapterIds(classes: CourseClassSource[]): string[] {
    return Array.from(new Set(
        classes
            .flatMap((courseClass) => courseClass.chapter_ids || [])
            .map((id) => id?.toString?.() ?? "")
            .filter((id) => id !== "")
    ));
}

export function buildCourseMenuDTO(classes: CourseClassSource[], chapters: CourseChapterSource[]): CourseMenu {
    const chapterById = buildChapterMap(chapters);
    return {
        class_titles: classes.map((courseClass) => ({
            class_id: String(courseClass._id),
            class_order: courseClass.class_order || 0,
            class_name: courseClass.class_name || "",
            chapter_titles: (courseClass.chapter_ids || [])
                .map((id) => chapterById.get(String(id)))
                .filter((chapter): chapter is CourseChapterSource => Boolean(chapter))
                .map((chapter) => ({
                    chapter_id: String(chapter._id),
                    chapter_order: chapter.chapter_order || 0,
                    chapter_name: chapter.chapter_name || ""
                }))
        }))
    };
}

export function selectFirstCourseTemplateId(classes: CourseClassSource[], chapters: CourseChapterSource[]): string | null {
    const chapterById = buildChapterMap(chapters);
    const sortedClasses = [...classes].sort((a, b) => (a.class_order || 0) - (b.class_order || 0));

    for (const courseClass of sortedClasses) {
        const classChapters = (courseClass.chapter_ids || [])
            .map((id) => chapterById.get(String(id)))
            .filter((chapter): chapter is CourseChapterSource => Boolean(chapter))
            .sort((a, b) => (a.chapter_order || 0) - (b.chapter_order || 0));

        for (const chapter of classChapters) {
            if (typeof chapter.template_id === "string" && chapter.template_id.trim() !== "") {
                return chapter.template_id;
            }
        }
    }

    return null;
}

function buildChapterMap(chapters: CourseChapterSource[]): Map<string, CourseChapterSource> {
    return new Map(
        chapters
            .filter((chapter) => chapter._id !== undefined && chapter._id !== null)
            .map((chapter) => [String(chapter._id), chapter])
    );
}
