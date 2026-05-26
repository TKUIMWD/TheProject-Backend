import { Service } from "../abstract/Service";
import { ChapterPageDTO } from "../interfaces/Chapter/ChapterPageDTO";
import { resp } from "../utils/resp"
import { courseStructureRequestAdapterService } from "../modules/courses/CourseStructureRequestAdapterService";

type CourseStructureServiceInput = {
    user: any;
    params?: Record<string, unknown>;
    body?: unknown;
};

type CourseStructureRequestAdapterPort = {
    getChapterById(input: CourseStructureServiceInput): Promise<resp<ChapterPageDTO | undefined>>;
    updateChapterById(input: CourseStructureServiceInput): Promise<resp<string | undefined>>;
    deleteChapterById(input: CourseStructureServiceInput): Promise<resp<string | undefined>>;
    addChapterToClass(input: CourseStructureServiceInput): Promise<resp<String | { chapter_id: string } | undefined>>;
};

export class ChapterService extends Service {
    constructor(private readonly requestAdapter: CourseStructureRequestAdapterPort = courseStructureRequestAdapterService) {
        super();
    }

    /**
     * @param input
     * @returns resp<ChapterPageDTO | undefined>
     */
    public getChapterById(input: CourseStructureServiceInput): Promise<resp<ChapterPageDTO | undefined>> {
        return this.requestAdapter.getChapterById(input);
    }

    /**
     * @description Deletes a chapter by its ID and handles all related data consistency.
     * @param input chapter route context containing the chapterId.
     * @returns A promise resolving to a success or error response.
     */
    public DeleteChapterById(input: CourseStructureServiceInput): Promise<resp<string | undefined>> {
        return this.requestAdapter.deleteChapterById(input);
    }

    /**
     * @description Updates a chapter's information by its ID.
     * @param input chapter route context containing the chapterId and update data.
     * @returns A promise resolving to a success or error response.
     */
    public UpdateChapterById(input: CourseStructureServiceInput): Promise<resp<string | undefined>> {
        return this.requestAdapter.updateChapterById(input);
    }

    public AddChapterToClass(input: CourseStructureServiceInput): Promise<resp<String | { chapter_id: string } | undefined>> {
        return this.requestAdapter.addChapterToClass(input);
    }
}
