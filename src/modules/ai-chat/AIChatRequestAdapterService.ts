import Roles from "../../enum/role";
import { User } from "../../interfaces/User";
import { resp } from "../../utils/resp";
import { aiChatBoxHintService } from "./AIChatBoxHintService";
import { aiChatPlatformGuideService } from "./AIChatPlatformGuideService";
import {
    aiChatVMManagementService,
    AIVMManagementResponse
} from "./AIChatVMManagementService";

type AIChatAdapterInput = {
    user: User;
    userRole?: Roles;
    body?: any;
};

type AIChatRequestAdapterServiceDeps = {
    boxHint?: {
        streamHint(input: { user: User; body: any }): AsyncGenerator<string, void, unknown>;
        getHint(input: { user: User; body: any }): Promise<resp<{ hint: string } | undefined>>;
    };
    platformGuide?: {
        streamGuide(input: { user: User; userRole: Roles; body: any }): AsyncGenerator<string, void, unknown>;
        getGuide(input: { user: User; userRole: Roles; body: any }): Promise<resp<{ response: string } | undefined>>;
    };
    vmManagement?: {
        manage(input: { body: any; user: User; isSuperAdmin?: boolean }): Promise<resp<AIVMManagementResponse | undefined>>;
    };
};

export class AIChatRequestAdapterService {
    private readonly boxHint: NonNullable<AIChatRequestAdapterServiceDeps["boxHint"]>;
    private readonly platformGuide: NonNullable<AIChatRequestAdapterServiceDeps["platformGuide"]>;
    private readonly vmManagement: NonNullable<AIChatRequestAdapterServiceDeps["vmManagement"]>;

    constructor(deps: AIChatRequestAdapterServiceDeps = {}) {
        this.boxHint = deps.boxHint ?? aiChatBoxHintService;
        this.platformGuide = deps.platformGuide ?? aiChatPlatformGuideService;
        this.vmManagement = deps.vmManagement ?? aiChatVMManagementService;
    }

    public streamBoxHint(input: AIChatAdapterInput): AsyncGenerator<string, void, unknown> {
        return this.boxHint.streamHint({
            user: input.user,
            body: input.body
        });
    }

    public getBoxHint(input: AIChatAdapterInput): Promise<resp<{ hint: string } | undefined>> {
        return this.boxHint.getHint({
            user: input.user,
            body: input.body
        });
    }

    public streamPlatformGuide(input: Required<AIChatAdapterInput>): AsyncGenerator<string, void, unknown> {
        return this.platformGuide.streamGuide({
            user: input.user,
            userRole: input.userRole,
            body: input.body
        });
    }

    public getPlatformGuide(input: Required<AIChatAdapterInput>): Promise<resp<{ response: string } | undefined>> {
        return this.platformGuide.getGuide({
            user: input.user,
            userRole: input.userRole,
            body: input.body
        });
    }

    public manageVM(input: AIChatAdapterInput): Promise<resp<AIVMManagementResponse | undefined>> {
        return this.vmManagement.manage({
            body: input.body,
            user: input.user,
            isSuperAdmin: input.user.role === Roles.SuperAdmin
        });
    }
}

export const aiChatRequestAdapterService = new AIChatRequestAdapterService();
