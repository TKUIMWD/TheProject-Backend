import { Service } from "../abstract/Service";
import { Request } from "express";
import { resp, createResponse } from "../utils/resp";
import { validateTokenAndGetUser, getTokenRole, validateTokenAndGetAdminUser } from "../utils/auth";
import { User } from "../interfaces/User";
import { logger } from "../middlewares/log";
import {
    aiChatVMManagementService,
    AIVMManagementResponse
} from "../modules/ai-chat/AIChatVMManagementService";
import { aiChatBoxHintService } from "../modules/ai-chat/AIChatBoxHintService";
import { aiChatPlatformGuideService } from "../modules/ai-chat/AIChatPlatformGuideService";


export class AIChatService extends Service {
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

            const { role: userRole, error: roleError } = await getTokenRole(Request);
            
            if (roleError || !userRole) {
                yield JSON.stringify({ 
                    error: roleError?.message || 'Unable to determine user role',
                    code: roleError?.code || 500 
                });
                return;
            }

            for await (const chunk of aiChatPlatformGuideService.streamGuide({
                user,
                userRole,
                body: Request.body
            })) {
                yield chunk;
            }
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

            const { role: userRole, error: roleError } = await getTokenRole(Request);
            
            if (roleError || !userRole) {
                return createResponse(
                    roleError?.code || 500, 
                    roleError?.message || 'Unable to determine user role'
                );
            }

            return aiChatPlatformGuideService.getGuide({
                user,
                userRole,
                body: Request.body
            });

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
                body: Request.body,
                user,
                isSuperAdmin: user.role === "superadmin"
            });
        } catch (error) {
            logger.error("Error in manageVM:", error);
            return createResponse(500, "Internal server error while managing VM");
        }
    }

}
