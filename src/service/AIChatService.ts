import { Service } from "../abstract/Service";
import { Request } from "express";
import { resp, createResponse } from "../utils/resp";
import { validateTokenAndGetUser, getTokenRole, validateTokenAndGetAdminUser, validateTokenAndGetSuperAdminUser } from "../utils/auth";
import { User } from "../interfaces/User";
import { logger } from "../middlewares/log";
import { PlatformGuidePrompts } from "../utils/AI_Prompts/PlatformGuidePrompts";
import { openAIClientFactory } from "../modules/openai/OpenAIClientFactory";
import * as fs from 'fs';
import * as path from 'path';
import {
    sanitizeAIChatUserInput,
    validateAIChatUserInput,
} from "../modules/ai-chat/AIChatRequestPolicy";
import {
    buildLanguageInstruction,
} from "../modules/ai-chat/AIChatLanguagePolicy";
import {
    aiChatVMManagementService,
    AIVMManagementResponse
} from "../modules/ai-chat/AIChatVMManagementService";
import { aiChatBoxHintService } from "../modules/ai-chat/AIChatBoxHintService";


export class AIChatService extends Service {

    private _platformGuideContent: string | null = null;

    private async _loadPlatformGuide(): Promise<string> {
        if (this._platformGuideContent) {
            return this._platformGuideContent;
        }

        try {
            const guidePath = path.join(__dirname, '../../docs/PLATFORM_GUIDE.md');
            this._platformGuideContent = fs.readFileSync(guidePath, 'utf-8');
            return this._platformGuideContent;
        } catch (error) {
            logger.error('Error loading platform guide:', error);
            return 'Platform guide not available. Please contact support.';
        }
    }

    public async *getBoxHintStream(Request: Request): AsyncGenerator<string, void, unknown> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                logger.error("Error validating token for getBoxHintStream:", error);
                yield JSON.stringify({ error: error.message, code: error.code });
                return;
            }

            for await (const chunk of aiChatBoxHintService.streamHint({
                user,
                body: Request.body
            })) {
                yield chunk;
            }
        } catch (error) {
            logger.error('Error in getBoxHintStream:', error);
            yield JSON.stringify({ 
                error: 'Internal server error while generating hint',
                code: 500 
            });
        }
    }

    public async getBoxHint(Request: Request): Promise<resp<{ hint: string } | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                logger.error("Error validating token for getBoxHint:", error);
                return createResponse(error.code, error.message);
            }

            return aiChatBoxHintService.getHint({
                user,
                body: Request.body
            });
        } catch (error) {
            logger.error('Error in getBoxHint:', error);
            return createResponse(500, 'Internal server error while generating hint');
        }
    }

    public async *getPlatformGuideStream(Request: Request): AsyncGenerator<string, void, unknown> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                logger.error("Error validating token for getPlatformGuideStream:", error);
                yield JSON.stringify({ error: error.message, code: error.code });
                return;
            }

            const { user_input } = Request.body;
            const inputResult = validateAIChatUserInput(user_input);
            if (!inputResult.valid) {
                yield JSON.stringify({ 
                    error: inputResult.message === "user_input must be a non-empty string"
                        ? "Missing required field: user_input is required"
                        : inputResult.message,
                    code: 400 
                });
                return;
            }

            logger.info(`User ${user.username} (${user._id}) requesting platform guidance (stream)`);

            const platformGuideContent = await this._loadPlatformGuide();
            const { role: userRole, error: roleError } = await getTokenRole(Request);
            
            if (roleError || !userRole) {
                yield JSON.stringify({ 
                    error: roleError?.message || 'Unable to determine user role',
                    code: roleError?.code || 500 
                });
                return;
            }

            const sanitizedInput = sanitizeAIChatUserInput(inputResult.input);
            
            const systemPrompt = `${PlatformGuidePrompts.SYSTEM_INIT}\n\n${buildLanguageInstruction(sanitizedInput)}`;
            const userPrompt = PlatformGuidePrompts.buildPlatformGuidePrompt(
                platformGuideContent,
                userRole,
                sanitizedInput
            );

            const openai = openAIClientFactory.createChatClient();
            const model = openAIClientFactory.chatModel();

            const stream = await openai.chat.completions.create({
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                stream: true,
                max_completion_tokens: 1500,
            });

            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content;
                if (content) {
                    yield content;
                }
            }

            logger.info(`Platform guidance generated successfully (stream) for User ${user.username}`);

        } catch (error) {
            logger.error('Error in getPlatformGuideStream:', error);
            yield JSON.stringify({ 
                error: 'Internal server error while generating guidance',
                code: 500 
            });
        }
    }

    public async getPlatformGuide(Request: Request): Promise<resp<{ response: string } | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                logger.error("Error validating token for getPlatformGuide:", error);
                return createResponse(error.code, error.message);
            }

            const { user_input } = Request.body;
            const inputResult = validateAIChatUserInput(user_input);
            if (!inputResult.valid) {
                return createResponse(400, inputResult.message === "user_input must be a non-empty string"
                    ? "Missing required field: user_input is required"
                    : inputResult.message);
            }

            logger.info(`User ${user.username} (${user._id}) requesting platform guidance (non-stream)`);

            const platformGuideContent = await this._loadPlatformGuide();
            const { role: userRole, error: roleError } = await getTokenRole(Request);
            
            if (roleError || !userRole) {
                return createResponse(
                    roleError?.code || 500, 
                    roleError?.message || 'Unable to determine user role'
                );
            }

            const sanitizedInput = sanitizeAIChatUserInput(inputResult.input);
            
            const systemPrompt = `${PlatformGuidePrompts.SYSTEM_INIT}\n\n${buildLanguageInstruction(sanitizedInput)}`;
            const userPrompt = PlatformGuidePrompts.buildPlatformGuidePrompt(
                platformGuideContent,
                userRole,
                sanitizedInput
            );

            const openai = openAIClientFactory.createChatClient();
            const model = openAIClientFactory.chatModel();

            const completion = await openai.chat.completions.create({
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                max_completion_tokens: 1500,
            });

            const response = completion.choices[0]?.message?.content || 'Unable to generate guidance at this time.';

            logger.info(`Platform guidance generated successfully (non-stream) for User ${user.username}`);

            return createResponse(200, 'Guidance generated successfully', { response });

        } catch (error) {
            logger.error('Error in getPlatformGuide:', error);
            return createResponse(500, 'Internal server error while generating guidance');
        }
    }

    public async manageVM(Request: Request): Promise<resp<AIVMManagementResponse | undefined>> {
        try {
            const { user, error } = await validateTokenAndGetAdminUser<User>(Request);
            if (error) {
                logger.error("Error validating token for manageVM:", error);
                return createResponse(error.code, error.message);
            }

            return aiChatVMManagementService.manage({
                req: Request,
                user
            });
        } catch (error) {
            logger.error("Error in manageVM:", error);
            return createResponse(500, "Internal server error while managing VM");
        }
    }

}
