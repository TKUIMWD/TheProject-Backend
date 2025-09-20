export interface ChapterPageDTO {
    course_id: string;
    course_name: string;
    class_id: string;
    class_name: string;
    chapter_id: string;
    chapter_name: string;
    chapter_subtitle: string;
    has_approved_content: string;
    waiting_for_approve_content: string;
    saved_content: string;
    chapter_order: number;
    template_id?: string;
}