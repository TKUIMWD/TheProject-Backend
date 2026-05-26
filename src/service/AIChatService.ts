import { Service } from "../abstract/Service";
import { Request } from "express";
import { resp, createResponse } from "../utils/resp";
import { validateTokenAndGetUser, getTokenRole, validateTokenAndGetAdminUser } from "../utils/auth";
import { User } from "../interfaces/User";
import { logger } from "../middlewares/log";
import { AIVMManagementResponse } from "../modules/ai-chat/AIChatVMManagementService";
import { aiChatRequestAdapterService } from "../modules/ai-chat/AIChatRequestAdapterService";
import Roles from "../enum/role";

type TokenValidator = <T>(Request: Request) => Promise<{ user: any; error?: resp<T | undefined> }>;


export class AIChatService extends Service {
    public async *getBoxHintStream(Request: Request): AsyncGenerator<string, void, unknown> {
        yield* this.streamAuthenticated(Request, "getBoxHintStream", "Internal server error while generating hint", (user) => aiChatRequestAdapterService.streamBoxHint({
            user,
            body: Request.body
        }));
    }

    public async getBoxHint(Request: Request): Promise<resp<{ hint: string } | undefined>> {
        return this.withAuthenticated(Request, "getBoxHint", "Internal server error while generating hint", (user) => aiChatRequestAdapterService.getBoxHint({
            user,
            body: Request.body
        }));
    }

    public async *getPlatformGuideStream(Request: Request): AsyncGenerator<string, void, unknown> {
        yield* this.streamAuthenticated(Request, "getPlatformGuideStream", "Internal server error while generating guidance", (user, userRole) => aiChatRequestAdapterService.streamPlatformGuide({
            user,
            userRole: userRole!,
            body: Request.body
        }), { requireRole: true });
    }

    public async getPlatformGuide(Request: Request): Promise<resp<{ response: string } | undefined>> {
        return this.withAuthenticated(Request, "getPlatformGuide", "Internal server error while generating guidance", (user, userRole) => aiChatRequestAdapterService.getPlatformGuide({
            user,
            userRole: userRole!,
            body: Request.body
        }), { requireRole: true });
    }

    public async manageVM(Request: Request): Promise<resp<AIVMManagementResponse | undefined>> {
        return this.withAuthenticated(Request, "manageVM", "Internal server error while managing VM", (user) => aiChatRequestAdapterService.manageVM({
            user,
            body: Request.body
        }), { validator: validateTokenAndGetAdminUser });
    }

    private async *streamAuthenticated(
        Request: Request,
        actionName: string,
        internalErrorMessage: string,
        action: (user: User, userRole?: Roles) => AsyncGenerator<string, void, unknown>,
        options: { requireRole?: boolean } = {}
    ): AsyncGenerator<string, void, unknown> {
        try {
            const { user, error } = await validateTokenAndGetUser<User>(Request);
            if (error) {
                logger.error(`Error validating token for ${actionName}:`, error);
                yield JSON.stringify({ error: error.message, code: error.code });
                return;
            }

            let userRole: Roles | undefined;
            if (options.requireRole) {
                const roleResult = await getTokenRole(Request);
                userRole = roleResult.role ?? undefined;
                if (roleResult.error || !userRole) {
                    yield JSON.stringify({
                        error: roleResult.error?.message || 'Unable to determine user role',
                        code: roleResult.error?.code || 500
                    });
                    return;
                }
            }

            for await (const chunk of action(user, userRole)) {
                yield chunk;
            }
        } catch (error) {
            logger.error(`Error in ${actionName}:`, error);
            yield JSON.stringify({
                error: internalErrorMessage,
                code: 500
            });
        }
    }

    private async withAuthenticated<T>(
        Request: Request,
        actionName: string,
        internalErrorMessage: string,
        action: (user: User, userRole?: Roles) => Promise<resp<T | undefined>>,
        options: { requireRole?: boolean; validator?: TokenValidator } = {}
    ): Promise<resp<T | undefined>> {
        try {
            const validator = options.validator ?? validateTokenAndGetUser;
            const { user, error } = await validator<T>(Request);
            if (error) {
                logger.error(`Error validating token for ${actionName}:`, error);
                return createResponse(error.code, error.message);
            }

            let userRole: Roles | undefined;
            if (options.requireRole) {
                const roleResult = await getTokenRole(Request);
                userRole = roleResult.role ?? undefined;
                if (roleResult.error || !userRole) {
                    return createResponse(
                        roleResult.error?.code || 500,
                        roleResult.error?.message || 'Unable to determine user role'
                    );
                }
            }

            return action(user, userRole);
        } catch (error) {
            logger.error(`Error in ${actionName}:`, error);
            return createResponse(500, internalErrorMessage);
        }
    }
}
