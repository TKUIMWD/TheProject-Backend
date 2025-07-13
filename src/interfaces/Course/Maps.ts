export interface ClassMap {
    class_id: string;
    class_order: number;
    class_name: string;
    chapter_titles: Array<ChapterMap>;
}

export interface ChapterMap {
    chapter_id: string;
    chapter_order: number;
    chapter_name: string;
}