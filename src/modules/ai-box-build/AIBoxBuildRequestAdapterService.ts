import { User } from "../../interfaces/User";
import { AIBoxBuildJobDTO } from "../../interfaces/AIBoxBuildJob";
import { resp } from "../../utils/resp";
import { aiBoxBuildDraftService } from "./AIBoxBuildDraftService";
import { AIBoxBuildJobManagementService } from "./AIBoxBuildJobManagementService";
import { AIBoxBuildRunLaunchService } from "./AIBoxBuildRunLaunchService";

export type AIBoxBuildDeleteJobResponse = {
    deleted_job_id: string;
    workspace_path?: string;
    workspace_deleted: boolean;
};

type AIBoxBuildAdapterInput = {
    user: User;
    params?: Record<string, any>;
    body?: any;
    authorizationHeader?: string;
};

type AIBoxBuildRequestAdapterServiceDeps = {
    draft?: {
        createJob(input: { user: User; request: any }): Promise<resp<AIBoxBuildJobDTO | undefined>>;
        addMessage(input: { user: User; jobId: unknown; request: any }): Promise<resp<AIBoxBuildJobDTO | undefined>>;
    };
    jobManagement?: {
        listJobs(user: User): Promise<resp<AIBoxBuildJobDTO[] | undefined>>;
        getJob(input: { user: User; jobId: unknown }): Promise<resp<AIBoxBuildJobDTO | undefined>>;
        deleteJob(input: { user: User; jobId: unknown }): Promise<resp<AIBoxBuildDeleteJobResponse | undefined>>;
        updateStatus(input: { user: User; jobId: unknown; status: unknown }): Promise<resp<AIBoxBuildJobDTO | undefined>>;
    };
    runLaunch?: {
        launch(input: {
            user: User;
            jobId: unknown;
            body: any;
            authorizationHeader: string;
        }): Promise<resp<AIBoxBuildJobDTO | undefined>>;
    };
};

export class AIBoxBuildRequestAdapterService {
    private readonly draft: NonNullable<AIBoxBuildRequestAdapterServiceDeps["draft"]>;
    private readonly jobManagement: NonNullable<AIBoxBuildRequestAdapterServiceDeps["jobManagement"]>;
    private readonly runLaunch: NonNullable<AIBoxBuildRequestAdapterServiceDeps["runLaunch"]>;

    constructor(deps: AIBoxBuildRequestAdapterServiceDeps = {}) {
        this.draft = deps.draft ?? aiBoxBuildDraftService;
        this.jobManagement = deps.jobManagement ?? new AIBoxBuildJobManagementService();
        this.runLaunch = deps.runLaunch ?? new AIBoxBuildRunLaunchService();
    }

    public createJob(input: AIBoxBuildAdapterInput): Promise<resp<AIBoxBuildJobDTO | undefined>> {
        return this.draft.createJob({
            user: input.user,
            request: input.body
        });
    }

    public listJobs(input: AIBoxBuildAdapterInput): Promise<resp<AIBoxBuildJobDTO[] | undefined>> {
        return this.jobManagement.listJobs(input.user);
    }

    public getJob(input: AIBoxBuildAdapterInput): Promise<resp<AIBoxBuildJobDTO | undefined>> {
        return this.jobManagement.getJob({
            user: input.user,
            jobId: input.params?.job_id
        });
    }

    public deleteJob(input: AIBoxBuildAdapterInput): Promise<resp<AIBoxBuildDeleteJobResponse | undefined>> {
        return this.jobManagement.deleteJob({
            user: input.user,
            jobId: input.params?.job_id
        });
    }

    public addMessage(input: AIBoxBuildAdapterInput): Promise<resp<AIBoxBuildJobDTO | undefined>> {
        return this.draft.addMessage({
            user: input.user,
            jobId: input.params?.job_id,
            request: input.body
        });
    }

    public updateStatus(input: AIBoxBuildAdapterInput): Promise<resp<AIBoxBuildJobDTO | undefined>> {
        return this.jobManagement.updateStatus({
            user: input.user,
            jobId: input.params?.job_id,
            status: input.body?.status
        });
    }

    public launchBuildRun(input: AIBoxBuildAdapterInput): Promise<resp<AIBoxBuildJobDTO | undefined>> {
        return this.runLaunch.launch({
            user: input.user,
            jobId: input.params?.job_id,
            body: input.body,
            authorizationHeader: input.authorizationHeader || ""
        });
    }
}
