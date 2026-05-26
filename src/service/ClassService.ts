import { Service } from "../abstract/Service";
import { resp } from "../utils/resp";
import { courseStructureRequestAdapterService } from "../modules/courses/CourseStructureRequestAdapterService";

export type CourseStructureServiceInput = {
    user: any;
    params?: Record<string, unknown>;
    body?: unknown;
};

type CourseStructureRequestAdapterPort = {
    getClassById(input: CourseStructureServiceInput): Promise<resp<any>>;
    updateClassById(input: CourseStructureServiceInput): Promise<resp<string | undefined>>;
    deleteClassById(input: CourseStructureServiceInput): Promise<resp<string | undefined>>;
    addClassToCourse(input: CourseStructureServiceInput): Promise<resp<String | { class_id: string } | undefined>>;
};

export class ClassService extends Service {
    constructor(private readonly requestAdapter: CourseStructureRequestAdapterPort = courseStructureRequestAdapterService) {
        super();
    }

    public getClassById(input: CourseStructureServiceInput): Promise<resp<any>> {
        return this.requestAdapter.getClassById(input);
    }

    public UpdateClassById(input: CourseStructureServiceInput): Promise<resp<string | undefined>> {
        return this.requestAdapter.updateClassById(input);
    }

    public DeleteClassById(input: CourseStructureServiceInput): Promise<resp<string | undefined>> {
        return this.requestAdapter.deleteClassById(input);
    }

    public AddClassToCourse(input: CourseStructureServiceInput): Promise<resp<String | { class_id: string } | undefined>> {
        return this.requestAdapter.addClassToCourse(input);
    }
}
