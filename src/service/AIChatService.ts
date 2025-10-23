import { Service } from "../abstract/Service";
import { Request } from "express";
import { resp, createResponse } from "../utils/resp";
import { validateTokenAndGetUser } from "../utils/auth";
import { VMBoxModel } from "../orm/schemas/VM/VMBoxSchemas";
import { VMModel } from "../orm/schemas/VM/VMSchemas";
import { User } from "../interfaces/User";
import { logger } from "../middlewares/log";
import { PentestBoxPrompts } from "../utils/AI_Prompts/PentestBoxPrompts";
import {OpenAI} from 'openai';

export class AIChatService extends Service {

    public async *getBoxHintStream(Request: Request): AsyncGenerator<string, void, unknown> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                logger.error("Error validating token for getBoxHintStream:", error);
                yield JSON.stringify({ error: error.message, code: error.code });
                return;
            }

            const { vm_id, user_input } = Request.body;

            if (!vm_id || !user_input) {
                yield JSON.stringify({ 
                    error: 'Missing required fields: vm_id and user_input are required',
                    code: 400 
                });
                return;
            }

            if (typeof user_input !== 'string' || user_input.trim().length === 0) {
                yield JSON.stringify({ 
                    error: 'user_input must be a non-empty string',
                    code: 400 
                });
                return;
            }

            if (user_input.length > 2000) {
                yield JSON.stringify({ 
                    error: 'user_input exceeds maximum length of 2000 characters',
                    code: 400 
                });
                return;
            }

            const vm = await VMModel.findById(vm_id).exec();
            if (!vm) {
                yield JSON.stringify({ error: 'VM not found', code: 404 });
                return;
            }

            if (vm.owner !== user._id.toString()) {
                yield JSON.stringify({ 
                    error: 'You do not have permission to access this VM',
                    code: 403 
                });
                return;
            }

            if (!vm.is_box_vm || !vm.box_id) {
                yield JSON.stringify({ 
                    error: 'This VM is not associated with a Box challenge',
                    code: 400 
                });
                return;
            }

            const box = await VMBoxModel.findById(vm.box_id).exec();
            if (!box) {
                yield JSON.stringify({ error: 'Associated Box not found', code: 404 });
                return;
            }

            logger.info(`User ${user.username} (${user._id}) requesting AI hint for VM ${vm_id}, Box ${vm.box_id}`);

            const sanitizedInput = this._sanitizeUserInput(user_input);
            const systemPrompt = PentestBoxPrompts.SYSTEM_INIT;
            const userPrompt = PentestBoxPrompts.buildHintPrompt(
                box.box_setup_description || 'Complete the security challenge',
                sanitizedInput
            );

            let OpenAI: any;
            try {
                OpenAI = (await import('openai')).default;
            } catch (importError) {
                logger.error('OpenAI module not installed:', importError);
                yield JSON.stringify({ 
                    error: 'OpenAI service not available. Please install openai package.',
                    code: 500 
                });
                return;
            }

            const openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY,
                maxRetries: 3,
                timeout: 60 * 1000,
            });

            const model = process.env.OPENAI_MODEL || 'gpt-4o';

            const stream = await openai.chat.completions.create({
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                stream: true,
                temperature: 0.7,
                max_tokens: 2000,
            });

            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content;
                if (content) {
                    yield content;
                }
            }

            logger.info(`AI hint generated successfully for VM ${vm_id}, Box ${vm.box_id}, User ${user.username}`);

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

            const { vm_id, user_input } = Request.body;

            if (!vm_id || !user_input) {
                return createResponse(400, 'Missing required fields: vm_id and user_input are required');
            }

            if (typeof user_input !== 'string' || user_input.trim().length === 0) {
                return createResponse(400, 'user_input must be a non-empty string');
            }

            if (user_input.length > 2000) {
                return createResponse(400, 'user_input exceeds maximum length of 2000 characters');
            }

            const vm = await VMModel.findById(vm_id).exec();
            if (!vm) {
                return createResponse(404, 'VM not found');
            }

            if (vm.owner !== user._id.toString()) {
                return createResponse(403, 'You do not have permission to access this VM');
            }

            if (!vm.is_box_vm || !vm.box_id) {
                return createResponse(400, 'This VM is not associated with a Box challenge');
            }

            const box = await VMBoxModel.findById(vm.box_id).exec();
            if (!box) {
                return createResponse(404, 'Associated Box not found');
            }

            logger.info(`User ${user.username} (${user._id}) requesting AI hint (non-stream) for VM ${vm_id}, Box ${vm.box_id}`);

            const sanitizedInput = this._sanitizeUserInput(user_input);
            const systemPrompt = PentestBoxPrompts.SYSTEM_INIT;
            const userPrompt = PentestBoxPrompts.buildHintPrompt(
                box.box_setup_description || 'Complete the security challenge',
                sanitizedInput
            );

            const openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY,
                maxRetries: 3,
                timeout: 60 * 1000,
            });

            const model = process.env.OPENAI_MODEL || 'gpt-4o';

            const completion = await openai.chat.completions.create({
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                max_tokens: 2000,
            });

            const hint = completion.choices[0]?.message?.content || 'Unable to generate hint at this time.';

            logger.info(`AI hint generated successfully (non-stream) for VM ${vm_id}, Box ${vm.box_id}, User ${user.username}`);

            return createResponse(200, 'Hint generated successfully', { hint });

        } catch (error) {
            logger.error('Error in getBoxHint:', error);
            return createResponse(500, 'Internal server error while generating hint');
        }
    }

    private _sanitizeUserInput(input: string): string {
        let sanitized = input.trim();
        
        const injectionPatterns = [
            /ignore\s+(all\s+)?previous\s+instructions?/gi,
            /forget\s+(all\s+)?previous\s+(instructions?|prompts?)/gi,
            /you\s+are\s+now/gi,
            /new\s+instructions?:/gi,
            /system\s*:/gi,
            /\[SYSTEM\]/gi,
            /\[INST\]/gi,
            /<!--|-->/g,
            /<\|im_start\|>/gi,
            /<\|im_end\|>/gi,
        ];

        for (const pattern of injectionPatterns) {
            sanitized = sanitized.replace(pattern, '[FILTERED]');
        }

        if (sanitized.length > 2000) {
            sanitized = sanitized.substring(0, 2000);
        }

        return sanitized;
    }
}
