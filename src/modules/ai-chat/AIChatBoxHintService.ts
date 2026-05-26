import Roles from "../../enum/role";
import { User } from "../../interfaces/User";
import { VM } from "../../interfaces/VM/VM";
import { logger } from "../../middlewares/log";
import { VMBox, VMBoxModel } from "../../orm/schemas/VM/VMBoxSchemas";
import { VMModel } from "../../orm/schemas/VM/VMSchemas";
import { PentestBoxPrompts } from "../../utils/AI_Prompts/PentestBoxPrompts";
import { createResponse, resp } from "../../utils/resp";
import { openAIClientFactory, OpenAIClientFactory } from "../openai/OpenAIClientFactory";
import { buildLanguageInstruction } from "./AIChatLanguagePolicy";
import { sanitizeAIChatUserInput, validateBoxHintRequest } from "./AIChatRequestPolicy";

type VMRepository = {
    findById(vmId: string): Promise<VM | null>;
};

type VMBoxRepository = {
    findById(boxId: string): Promise<VMBox | null>;
};

type ChatClient = {
    chat: {
        completions: {
            create(request: Record<string, unknown>): Promise<any>;
        };
    };
};

type ChatClientFactory = Pick<OpenAIClientFactory, "chatModel"> & {
    createChatClient(): ChatClient;
};

type HintContext = {
    vmId: string;
    boxId: string;
    sanitizedInput: string;
    boxHintContext: string;
};

type AIChatBoxHintServiceDeps = {
    vmRepo?: VMRepository;
    boxRepo?: VMBoxRepository;
    chatFactory?: ChatClientFactory;
};

const vmModelRepository: VMRepository = {
    async findById(vmId: string): Promise<VM | null> {
        return VMModel.findById(vmId).exec();
    }
};

const vmBoxModelRepository: VMBoxRepository = {
    async findById(boxId: string): Promise<VMBox | null> {
        return VMBoxModel.findById(boxId).exec();
    }
};

export class AIChatBoxHintService {
    private readonly vmRepo: VMRepository;
    private readonly boxRepo: VMBoxRepository;
    private readonly chatFactory: ChatClientFactory;

    constructor(deps: AIChatBoxHintServiceDeps = {}) {
        this.vmRepo = deps.vmRepo ?? vmModelRepository;
        this.boxRepo = deps.boxRepo ?? vmBoxModelRepository;
        this.chatFactory = deps.chatFactory ?? (openAIClientFactory as unknown as ChatClientFactory);
    }

    public async *streamHint(input: {
        user: User;
        body: { vm_id?: unknown; user_input?: unknown };
    }): AsyncGenerator<string, void, unknown> {
        try {
            const contextResult = await this.buildHintContext(input.user, input.body);
            if (!contextResult.ok) {
                yield this.toStreamError(contextResult.error);
                return;
            }

            logger.info(`User ${input.user.username} (${input.user._id}) requesting AI hint for VM ${contextResult.context.vmId}, Box ${contextResult.context.boxId}`);

            const stream = await this.chatFactory.createChatClient().chat.completions.create({
                ...this.buildCompletionRequest(contextResult.context),
                stream: true
            });

            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content;
                if (content) {
                    yield content;
                }
            }

            logger.info(`AI hint generated successfully for VM ${contextResult.context.vmId}, Box ${contextResult.context.boxId}, User ${input.user.username}`);
        } catch (error) {
            logger.error("Error in AIChatBoxHintService.streamHint:", error);
            yield JSON.stringify({
                error: "Internal server error while generating hint",
                code: 500
            });
        }
    }

    public async getHint(input: {
        user: User;
        body: { vm_id?: unknown; user_input?: unknown };
    }): Promise<resp<{ hint: string } | undefined>> {
        try {
            const contextResult = await this.buildHintContext(input.user, input.body);
            if (!contextResult.ok) {
                return createResponse(contextResult.error.code, contextResult.error.message);
            }

            logger.info(`User ${input.user.username} (${input.user._id}) requesting AI hint (non-stream) for VM ${contextResult.context.vmId}, Box ${contextResult.context.boxId}`);

            const completion = await this.chatFactory.createChatClient().chat.completions.create(
                this.buildCompletionRequest(contextResult.context)
            );

            const hint = completion.choices[0]?.message?.content || "Unable to generate hint at this time.";
            logger.info(`AI hint generated successfully (non-stream) for VM ${contextResult.context.vmId}, Box ${contextResult.context.boxId}, User ${input.user.username}`);

            return createResponse(200, "Hint generated successfully", { hint });
        } catch (error) {
            logger.error("Error in AIChatBoxHintService.getHint:", error);
            return createResponse(500, "Internal server error while generating hint");
        }
    }

    private async buildHintContext(
        user: User,
        body: { vm_id?: unknown; user_input?: unknown }
    ): Promise<{ ok: true; context: HintContext } | { ok: false; error: resp<undefined> }> {
        const requestPolicy = validateBoxHintRequest({
            vm_id: body.vm_id,
            user_input: body.user_input
        });
        if (!requestPolicy.valid) {
            return { ok: false, error: createResponse(400, requestPolicy.message) };
        }

        const vm = await this.vmRepo.findById(requestPolicy.vmId);
        if (!vm) {
            return { ok: false, error: createResponse(404, "VM not found") };
        }

        if (user.role !== Roles.SuperAdmin && vm.owner !== user._id!.toString()) {
            return { ok: false, error: createResponse(403, "You do not have permission to access this VM") };
        }

        if (!vm.is_box_vm || !vm.box_id) {
            return { ok: false, error: createResponse(400, "This VM is not associated with a Box challenge") };
        }

        const box = await this.boxRepo.findById(vm.box_id);
        if (!box) {
            return { ok: false, error: createResponse(404, "Associated Box not found") };
        }

        if (box.allow_ai_assistant === false) {
            return { ok: false, error: createResponse(403, "This Box has disabled AI assistant hints") };
        }

        return {
            ok: true,
            context: {
                vmId: requestPolicy.vmId,
                boxId: vm.box_id,
                sanitizedInput: sanitizeAIChatUserInput(requestPolicy.userInput),
                boxHintContext: box.design_md || box.box_setup_description || "Complete the security challenge"
            }
        };
    }

    private buildCompletionRequest(context: HintContext): Record<string, unknown> {
        const systemPrompt = `${PentestBoxPrompts.SYSTEM_INIT}\n\n${buildLanguageInstruction(context.sanitizedInput)}`;
        const userPrompt = PentestBoxPrompts.buildHintPrompt(
            context.boxHintContext,
            context.sanitizedInput
        );

        return {
            model: this.chatFactory.chatModel(),
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            max_completion_tokens: 2000
        };
    }

    private toStreamError(error: resp<undefined>): string {
        return JSON.stringify({
            error: error.message,
            code: error.code
        });
    }
}

export const aiChatBoxHintService = new AIChatBoxHintService();
