import { Service } from "../abstract/Service";
import {
    AIBoxBuildJobDTO,
} from "../interfaces/AIBoxBuildJob";
import { resp } from "../utils/resp";
import { AIBoxBuildJobManagementService } from "../modules/ai-box-build/AIBoxBuildJobManagementService";
import { aiBoxBuildDraftService } from "../modules/ai-box-build/AIBoxBuildDraftService";
import { AIBoxBuildRunExecutionService } from "../modules/ai-box-build/AIBoxBuildRunExecutionService";
import { AIBoxBuildRunLaunchService } from "../modules/ai-box-build/AIBoxBuildRunLaunchService";
import {
    AIBoxBuildDeleteJobResponse,
    AIBoxBuildRequestAdapterService
} from "../modules/ai-box-build/AIBoxBuildRequestAdapterService";
import { User } from "../interfaces/User";

export type AIBoxBuildServiceAdapterInput = {
    user: User;
    params?: Record<string, unknown>;
    body?: any;
    authorizationHeader?: string;
};

export class AIBoxBuildService extends Service {
    private static runningJobs = new Set<string>();
    private readonly jobManagementService = new AIBoxBuildJobManagementService({
        runningJobs: AIBoxBuildService.runningJobs
    });
    private readonly runExecutionService = new AIBoxBuildRunExecutionService();
    private readonly runLaunchService = new AIBoxBuildRunLaunchService({
        runningJobs: AIBoxBuildService.runningJobs,
        runExecution: this.runExecutionService
    });
    private readonly requestAdapter = new AIBoxBuildRequestAdapterService({
        draft: aiBoxBuildDraftService,
        jobManagement: this.jobManagementService,
        runLaunch: this.runLaunchService
    });

    public createJob(input: AIBoxBuildServiceAdapterInput): Promise<resp<AIBoxBuildJobDTO | undefined>> {
        return this.requestAdapter.createJob(this.normalizeInput(input));
    }

    public listJobs(input: AIBoxBuildServiceAdapterInput): Promise<resp<AIBoxBuildJobDTO[] | undefined>> {
        return this.requestAdapter.listJobs(this.normalizeInput(input));
    }

    public getJob(input: AIBoxBuildServiceAdapterInput): Promise<resp<AIBoxBuildJobDTO | undefined>> {
        return this.requestAdapter.getJob(this.normalizeInput(input));
    }

    public deleteJob(input: AIBoxBuildServiceAdapterInput): Promise<resp<AIBoxBuildDeleteJobResponse | undefined>> {
        return this.requestAdapter.deleteJob(this.normalizeInput(input));
    }

    public addMessage(input: AIBoxBuildServiceAdapterInput): Promise<resp<AIBoxBuildJobDTO | undefined>> {
        return this.requestAdapter.addMessage(this.normalizeInput(input));
    }

    public updateStatus(input: AIBoxBuildServiceAdapterInput): Promise<resp<AIBoxBuildJobDTO | undefined>> {
        return this.requestAdapter.updateStatus(this.normalizeInput(input));
    }

    public launchBuildRun(input: AIBoxBuildServiceAdapterInput): Promise<resp<AIBoxBuildJobDTO | undefined>> {
        return this.requestAdapter.launchBuildRun(this.normalizeInput(input));
    }

    private normalizeInput(input: AIBoxBuildServiceAdapterInput): Required<AIBoxBuildServiceAdapterInput> {
        return {
            user: input.user,
            params: input.params ?? {},
            body: input.body ?? {},
            authorizationHeader: input.authorizationHeader ?? ""
        };
    }
}
