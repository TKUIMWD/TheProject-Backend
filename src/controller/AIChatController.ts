import { Controller } from "../abstract/Controller";
import { Request, Response } from "express";
import { AIChatService, AIChatServiceInput } from "../service/AIChatService";
import { logger } from "../middlewares/log";
import Roles from "../enum/role";
import { User } from "../interfaces/User";
import { getTokenRole, validateTokenAndGetAdminUser, validateTokenAndGetUser } from "../utils/auth";
import { createResponse, resp } from "../utils/resp";

type TokenValidator = <T>(Request: Request) => Promise<{ user: User; error?: resp<T | undefined> }>;

export class AIChatController extends Controller {
    protected service: AIChatService;

    constructor() {
        super();
        this.service = new AIChatService();
    }

    public async getBoxHintStream(Request: Request, Response: Response) {
        Response.setHeader('Content-Type', 'text/event-stream');
        Response.setHeader('Cache-Control', 'no-cache');
        Response.setHeader('Connection', 'keep-alive');
        Response.setHeader('X-Accel-Buffering', 'no');

        Response.write('data: {"status":"connected"}\n\n');

        const stream = this.streamAuthenticated(Request, "getBoxHintStream", "Internal server error while generating hint", (input) =>
            this.service.getBoxHintStream(input)
        );

        for await (const chunk of stream) {
            if (chunk.startsWith('{') && chunk.includes('error')) {
                Response.write(`data: ${chunk}\n\n`);
                Response.end();
                return;
            }

            Response.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
        }

        Response.write('data: {"status":"completed"}\n\n');
        Response.end();
    }

    public async getBoxHint(Request: Request, Response: Response) {
        const resp = await this.withAuthenticated(Request, "getBoxHint", "Internal server error while generating hint", (input) =>
            this.service.getBoxHint(input)
        );
        Response.status(resp.code).send(resp)
    }

    public async getPlatformGuideStream(req: Request, res: Response): Promise<void> {
        try {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');

            for await (const chunk of this.streamAuthenticated(req, "getPlatformGuideStream", "Internal server error while generating guidance", (input) =>
                this.service.getPlatformGuideStream({
                    user: input.user,
                    userRole: input.userRole!,
                    body: input.body
                }), { requireRole: true })) {
                res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
            }

            res.write('data: [DONE]\n\n');
            res.end();
        } catch (error) {
            logger.error('Error in getPlatformGuideStream controller:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    public async getPlatformGuide(req: Request, res: Response): Promise<void> {
        try {
            const result = await this.withAuthenticated(req, "getPlatformGuide", "Internal server error while generating guidance", (input) =>
                this.service.getPlatformGuide({
                    user: input.user,
                    userRole: input.userRole!,
                    body: input.body
                }), { requireRole: true });
            res.status(result.code).json(result);
        } catch (error) {
            logger.error('Error in getPlatformGuide controller:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    public async manageVM(req: Request, res: Response): Promise<void> {
        try {
            const result = await this.withAuthenticated(req, "manageVM", "Internal server error while managing VM", (input) =>
                this.service.manageVM(input),
                { validator: validateTokenAndGetAdminUser }
            );
            res.status(result.code).json(result);
        } catch (error) {
            logger.error('Error in manageVM controller:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    private async *streamAuthenticated(
        Request: Request,
        actionName: string,
        internalErrorMessage: string,
        action: (input: AIChatServiceInput) => AsyncGenerator<string, void, unknown>,
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

            for await (const chunk of action(this.toServiceInput(Request, user, userRole))) {
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
        action: (input: AIChatServiceInput) => Promise<resp<T | undefined>>,
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

            return action(this.toServiceInput(Request, user, userRole));
        } catch (error) {
            logger.error(`Error in ${actionName}:`, error);
            return createResponse(500, internalErrorMessage);
        }
    }

    private toServiceInput(Request: Request, user: User, userRole?: Roles): AIChatServiceInput {
        return {
            user,
            userRole,
            body: Request.body
        };
    }
}
