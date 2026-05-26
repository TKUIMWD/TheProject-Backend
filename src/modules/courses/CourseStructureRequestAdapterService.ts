import { ChapterPageDTO } from "../../interfaces/Chapter/ChapterPageDTO";
import { resp } from "../../utils/resp";
import { chapterManagementService } from "./ChapterManagementService";
import { classManagementService } from "./ClassManagementService";

type CourseStructureAdapterInput = {
    user: any;
    params?: Record<string, any>;
    body?: any;
};

type CourseStructureRequestAdapterServiceDeps = {
    classManagement?: {
        getClassById(input: { user: any; classId: unknown }): Promise<resp<any>>;
        updateClassById(input: { user: any; classId: unknown; body: Record<string, unknown> }): Promise<resp<string | undefined>>;
        deleteClassById(input: { user: any; classId: unknown }): Promise<resp<string | undefined>>;
        addClassToCourse(input: { user: any; courseId: unknown; body: Record<string, unknown> }): Promise<resp<String | { class_id: string } | undefined>>;
    };
    chapterManagement?: {
        getChapterById(input: { user: any; chapterId: unknown }): Promise<resp<ChapterPageDTO | undefined>>;
        updateChapterById(input: { user: any; chapterId: unknown; body: Record<string, unknown> }): Promise<resp<string | undefined>>;
        deleteChapterById(input: { user: any; chapterId: unknown }): Promise<resp<string | undefined>>;
        addChapterToClass(input: { user: any; classId: unknown; body: Record<string, unknown> }): Promise<resp<String | { chapter_id: string } | undefined>>;
    };
};

export class CourseStructureRequestAdapterService {
    private readonly classManagement: NonNullable<CourseStructureRequestAdapterServiceDeps["classManagement"]>;
    private readonly chapterManagement: NonNullable<CourseStructureRequestAdapterServiceDeps["chapterManagement"]>;

    constructor(deps: CourseStructureRequestAdapterServiceDeps = {}) {
        this.classManagement = deps.classManagement ?? classManagementService;
        this.chapterManagement = deps.chapterManagement ?? chapterManagementService;
    }

    public getClassById(input: CourseStructureAdapterInput): Promise<resp<any>> {
        return this.classManagement.getClassById({
            user: input.user,
            classId: input.params?.classId
        });
    }

    public updateClassById(input: CourseStructureAdapterInput): Promise<resp<string | undefined>> {
        return this.classManagement.updateClassById({
            user: input.user,
            classId: input.params?.classId,
            body: input.body
        });
    }

    public deleteClassById(input: CourseStructureAdapterInput): Promise<resp<string | undefined>> {
        return this.classManagement.deleteClassById({
            user: input.user,
            classId: input.params?.classId
        });
    }

    public addClassToCourse(input: CourseStructureAdapterInput): Promise<resp<String | { class_id: string } | undefined>> {
        return this.classManagement.addClassToCourse({
            user: input.user,
            courseId: input.params?.courseId,
            body: input.body
        });
    }

    public getChapterById(input: CourseStructureAdapterInput): Promise<resp<ChapterPageDTO | undefined>> {
        return this.chapterManagement.getChapterById({
            user: input.user,
            chapterId: input.params?.chapterId
        });
    }

    public updateChapterById(input: CourseStructureAdapterInput): Promise<resp<string | undefined>> {
        return this.chapterManagement.updateChapterById({
            user: input.user,
            chapterId: input.params?.chapterId,
            body: input.body
        });
    }

    public deleteChapterById(input: CourseStructureAdapterInput): Promise<resp<string | undefined>> {
        return this.chapterManagement.deleteChapterById({
            user: input.user,
            chapterId: input.params?.chapterId
        });
    }

    public addChapterToClass(input: CourseStructureAdapterInput): Promise<resp<String | { chapter_id: string } | undefined>> {
        return this.chapterManagement.addChapterToClass({
            user: input.user,
            classId: input.params?.classId,
            body: input.body
        });
    }
}

export const courseStructureRequestAdapterService = new CourseStructureRequestAdapterService();
