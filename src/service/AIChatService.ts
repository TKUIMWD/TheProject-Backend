import { Service } from "../abstract/Service";
import { resp } from "../utils/resp";
import { User } from "../interfaces/User";
import { AIVMManagementResponse } from "../modules/ai-chat/AIChatVMManagementService";
import { aiChatRequestAdapterService } from "../modules/ai-chat/AIChatRequestAdapterService";
import Roles from "../enum/role";

export type AIChatServiceInput = {
    user: User;
    userRole?: Roles;
    body: any;
};

export class AIChatService extends Service {
    public getBoxHintStream(input: AIChatServiceInput): AsyncGenerator<string, void, unknown> {
        return aiChatRequestAdapterService.streamBoxHint(input);
    }

    public getBoxHint(input: AIChatServiceInput): Promise<resp<{ hint: string } | undefined>> {
        return aiChatRequestAdapterService.getBoxHint(input);
    }

    public getPlatformGuideStream(input: AIChatServiceInput & { userRole: Roles }): AsyncGenerator<string, void, unknown> {
        return aiChatRequestAdapterService.streamPlatformGuide(input);
    }

    public getPlatformGuide(input: AIChatServiceInput & { userRole: Roles }): Promise<resp<{ response: string } | undefined>> {
        return aiChatRequestAdapterService.getPlatformGuide(input);
    }

    public manageVM(input: AIChatServiceInput): Promise<resp<AIVMManagementResponse | undefined>> {
        return aiChatRequestAdapterService.manageVM(input);
    }
}
