export interface Chapter {
    _id?: string,
    chapter_order: number,
    chapter_name: string,
    chapter_subtitle: string,
    has_approved_content: string,
    waiting_for_approve_content: string,
    saved_content: string
}